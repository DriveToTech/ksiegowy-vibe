import type { KsefEnvironment, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { createKsefClient } from '@ksiegowy/ksef-client';
import { parseFa3Xml } from '@ksiegowy/fa3-xml';
import { KsefClientError } from '@ksiegowy/ksef-client';
import { getOrCreateKsefSession, initKsefSession } from './ksef.service.js';

const PAGE_SIZE = 100;

const isUniqueConstraintViolation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === 'P2002';
};

const resolveFallbackTotalGross = (header: {
  gross?: string;
  net?: string;
  vat?: string;
}): string | undefined => {
  if (header.gross && header.gross.trim().length > 0) {
    return header.gross;
  }

  if (!header.net || !header.vat) {
    return undefined;
  }

  const netAmount = Number.parseFloat(header.net);
  const vatAmount = Number.parseFloat(header.vat);

  if (Number.isNaN(netAmount) || Number.isNaN(vatAmount)) {
    return undefined;
  }

  return (netAmount + vatAmount).toFixed(2);
};

export interface KsefIncomingSyncResult {
  readonly created: number;
  readonly linked: number;
  readonly skipped: number;
  readonly syncId: string;
}

/**
 * Queries KSeF for invoices where the company is the buyer (subject2),
 * then upserts into IncomingInvoice:
 *   - Already linked by ksefReference → update ksefFetchedAt (skipped)
 *   - Matched by sellerNip+invoiceNumber without ksefReference → link it (linked)
 *   - Not found at all → fetch full XML and create new record (created)
 */
export const syncIncomingInvoicesFromKsef = async (
  prisma: PrismaClient,
  companyId: string,
  encryptionKey: string,
  selectedEnvironment: KsefEnvironment,
  dateFrom: string,
  dateTo: string,
  logger: FastifyBaseLogger
): Promise<KsefIncomingSyncResult> => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { nip: true }
  });

  if (!company) throw new Error(`Company ${companyId} not found`);

  const syncRecord = await prisma.ksefIncomingSync.create({
    data: { companyId, environment: selectedEnvironment, dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }
  });

  const environment = selectedEnvironment === 'PRODUCTION' ? 'production' : 'test';

  let created = 0;
  let linked = 0;
  let skipped = 0;

  const run = async (): Promise<void> => {
    let accessToken = await getOrCreateKsefSession(prisma, companyId, encryptionKey, selectedEnvironment);
    const client = createKsefClient({ environment });

    logger.info({ companyId, dateFrom, dateTo, syncId: syncRecord.id }, 'KSeF incoming invoice sync started');

    let pageOffset = 0;

    while (true) {
      let queryResult;

      try {
        queryResult = await client.queryIncomingInvoices({ accessToken, dateFrom, dateTo, pageOffset, pageSize: PAGE_SIZE });
      } catch (error) {
        if (error instanceof KsefClientError && error.statusCode === 401) {
          accessToken = await initKsefSession(prisma, companyId, encryptionKey, selectedEnvironment);
          queryResult = await client.queryIncomingInvoices({ accessToken, dateFrom, dateTo, pageOffset, pageSize: PAGE_SIZE });
        } else {
          throw error;
        }
      }

      for (const header of queryResult.invoiceHeaderList) {
        // v2 returns seller NIP under seller.nip; v1 used subjectBy.issuedByIdentifier.value
        const sellerNip = header.seller?.nip ?? header.seller?.identifier?.value ?? '';
        // v2 uses ksefNumber; v1 used ksefReferenceNumber
        const ksefReference = header.ksefNumber ?? header.ksefReferenceNumber ?? '';

        if (!ksefReference.trim()) {
          skipped++;
          logger.error(
            { companyId, syncId: syncRecord.id },
            'KSeF incoming invoice skipped because it has no KSeF reference'
          );
          continue;
        }

        // Case A: already linked to this KSeF reference (scoped by environment)
        const existingLinked = await prisma.incomingInvoice.findFirst({
          where: { companyId, environment: selectedEnvironment, ksefReference },
          select: { id: true }
        });

        if (existingLinked) {
          await prisma.incomingInvoice.update({
            where: { id: existingLinked.id },
            data: { ksefEnvironment: selectedEnvironment, ksefFetchedAt: new Date() }
          });
          skipped++;
          continue;
        }

        // Case B: uploaded via OCR, not yet linked — match by sellerNip + invoiceNumber
        // invoiceNumber may be absent from v2 metadata (available only after XML fetch)
        const metadataInvoiceNumber = header.invoiceNumber ?? null;
        const existingUpload = metadataInvoiceNumber
          ? await prisma.incomingInvoice.findFirst({
            where: {
              companyId,
              environment: selectedEnvironment,
              source: 'upload',
              sellerNip,
              invoiceNumber: metadataInvoiceNumber,
              ksefReference: null,
            },
            select: { id: true }
          })
          : null;

        if (existingUpload) {
          await prisma.incomingInvoice.update({
            where: { id: existingUpload.id },
            data: {
              environment: selectedEnvironment,
              ksefEnvironment: selectedEnvironment,
              ksefReference,
              ksefFetchedAt: new Date(),
              status: 'KSEF_SYNCED',
            }
          });
          linked++;
          continue;
        }

        // Case C: not in system — fetch full XML, parse, and create
        let xml: string;

        try {
          xml = await client.fetchInvoiceXml({ accessToken, ksefReferenceNumber: ksefReference });
        } catch (error) {
          if (error instanceof KsefClientError && error.statusCode === 401) {
            accessToken = await initKsefSession(prisma, companyId, encryptionKey, selectedEnvironment);
            xml = await client.fetchInvoiceXml({ accessToken, ksefReferenceNumber: ksefReference });
          } else {
            throw error;
          }
        }

        const fallbackInvoiceNumber = header.invoiceNumber ?? ksefReference;
        const fallbackIssueDate = header.issueDate ?? header.invoicingDate;
        const fallbackSellerName = header.seller?.name;
        const fallbackTotalGross = resolveFallbackTotalGross(header);
        const parsed = parseFa3Xml(xml, {
          fallbackInvoiceNumber,
          ...(fallbackIssueDate !== undefined ? { fallbackIssueDate } : {}),
          ...(sellerNip !== '' ? { fallbackSellerNip: sellerNip } : {}),
          ...(fallbackSellerName !== undefined ? { fallbackSellerName } : {}),
          ...(fallbackTotalGross !== undefined ? { fallbackTotalGross } : {}),
        });

        // Find existing contractor or auto-create one from KSeF data so the
        // seller is represented in the system even if never manually added.
        let contractorId: string | null = null;

        if (sellerNip) {
          const existing = await prisma.contractor.findUnique({
            where: { companyId_nip: { companyId, nip: sellerNip } },
            select: { id: true }
          });

          if (existing) {
            contractorId = existing.id;
          } else {
            try {
              const created = await prisma.contractor.create({
                data: {
                  companyId,
                  nip: sellerNip,
                  name: parsed.sellerName,
                  addressLine1: parsed.sellerAddress ?? null,
                  countryCode: 'PL',
                  isActive: true
                },
                select: { id: true }
              });
              contractorId = created.id;
            } catch (error: unknown) {
              if (!isUniqueConstraintViolation(error)) throw error;

              const concurrentlyCreated = await prisma.contractor.findUnique({
                where: { companyId_nip: { companyId, nip: sellerNip } },
                select: { id: true },
              });

              if (!concurrentlyCreated) throw error;
              contractorId = concurrentlyCreated.id;
            }
          }
        }

        try {
          await prisma.incomingInvoice.create({
            data: {
              companyId,
              environment: selectedEnvironment,
              source: 'ksef',
              ksefEnvironment: selectedEnvironment,
              status: 'CONFIRMED',
              ksefReference,
              ksefFetchedAt: new Date(),
              confirmedAt: new Date(),
              sellerNip,
              sellerName: parsed.sellerName,
              sellerAddress: parsed.sellerAddress,
              buyerName: parsed.buyerName,
              buyerNip: parsed.buyerNip,
              invoiceNumber: parsed.invoiceNumber,
              issueDate: new Date(parsed.issueDate),
              saleDate: parsed.saleDate !== null ? new Date(parsed.saleDate) : null,
              totalNet: parsed.totalNet,
              totalVat: parsed.totalVat,
              totalGross: parsed.totalGross,
              currency: parsed.currency,
              dueDate: parsed.dueDate !== null ? new Date(parsed.dueDate) : null,
              bankAccount: parsed.bankAccount,
              paymentMethod: parsed.paymentMethod,
              lineItemsJson: parsed.lineItems as object[],
              contractorId
            }
          });

          created++;
        } catch (error: unknown) {
          if (!isUniqueConstraintViolation(error)) throw error;

          const concurrentlyCreated = await prisma.incomingInvoice.findFirst({
            where: { companyId, environment: selectedEnvironment, ksefReference },
            select: { id: true },
          });

          if (!concurrentlyCreated) throw error;

          await prisma.incomingInvoice.update({
            where: { id: concurrentlyCreated.id },
            data: { ksefFetchedAt: new Date() },
          });
          skipped++;
        }
      }

      if (!queryResult.hasMore) break;
      pageOffset += PAGE_SIZE;
    }
  };

  await run().catch(async (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.ksefIncomingSync.update({
      where: { id: syncRecord.id },
      data: { errorMessage }
    });
    throw error;
  });

  await prisma.ksefIncomingSync.update({
    where: { id: syncRecord.id },
    data: { createdCount: created, linkedCount: linked, skippedCount: skipped, finishedAt: new Date() }
  });

  logger.info({ companyId, created, linked, skipped, syncId: syncRecord.id }, 'KSeF incoming invoice sync completed');

  return { created, linked, skipped, syncId: syncRecord.id };
};
