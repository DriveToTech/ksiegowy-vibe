import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { createKsefClient } from '@ksiegowy/ksef-client';
import { parseFa3Xml } from '@ksiegowy/fa3-xml';
import { KsefClientError } from '@ksiegowy/ksef-client';
import { getOrCreateKsefSession, initKsefSession } from './ksef.service.js';

const PAGE_SIZE = 100;

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
  dateFrom: string,
  dateTo: string,
  logger: FastifyBaseLogger
): Promise<KsefIncomingSyncResult> => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { nip: true, ksefEnv: true }
  });

  if (!company) throw new Error(`Company ${companyId} not found`);

  const syncRecord = await prisma.ksefIncomingSync.create({
    data: { companyId, dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) }
  });

  const environment = company.ksefEnv === 'PRODUCTION' ? 'production' : 'test';

  let created = 0;
  let linked = 0;
  let skipped = 0;

  const run = async (): Promise<void> => {
    let accessToken = await getOrCreateKsefSession(prisma, companyId, encryptionKey);
    const client = createKsefClient({ environment });

    logger.info({ companyId, dateFrom, dateTo, syncId: syncRecord.id }, 'KSeF incoming invoice sync started');

    let pageOffset = 0;

    while (true) {
      let queryResult;

      try {
        queryResult = await client.queryIncomingInvoices({ accessToken, dateFrom, dateTo, pageOffset, pageSize: PAGE_SIZE });
      } catch (error) {
        if (error instanceof KsefClientError && error.statusCode === 401) {
          accessToken = await initKsefSession(prisma, companyId, encryptionKey);
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

        // Case A: already linked to this KSeF reference
        const existingLinked = await prisma.incomingInvoice.findFirst({
          where: { companyId, ksefReference },
          select: { id: true }
        });

        if (existingLinked) {
          await prisma.incomingInvoice.update({
            where: { id: existingLinked.id },
            data: { ksefFetchedAt: new Date() }
          });
          skipped++;
          continue;
        }

        // Case B: uploaded via OCR, not yet linked — match by sellerNip + invoiceNumber
        // invoiceNumber may be absent from v2 metadata (available only after XML fetch)
        const metadataInvoiceNumber = header.invoiceNumber ?? null;
        const existingUpload = metadataInvoiceNumber
          ? await prisma.incomingInvoice.findFirst({
              where: { companyId, sellerNip, invoiceNumber: metadataInvoiceNumber, ksefReference: null },
              select: { id: true }
            })
          : null;

        if (existingUpload) {
          await prisma.incomingInvoice.update({
            where: { id: existingUpload.id },
            data: { ksefReference, ksefFetchedAt: new Date(), status: 'KSEF_SYNCED' }
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
            accessToken = await initKsefSession(prisma, companyId, encryptionKey);
            xml = await client.fetchInvoiceXml({ accessToken, ksefReferenceNumber: ksefReference });
          } else {
            throw error;
          }
        }

        const parsed = parseFa3Xml(xml);

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
          }
        }

        await prisma.incomingInvoice.create({
          data: {
            companyId,
            source: 'ksef',
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
