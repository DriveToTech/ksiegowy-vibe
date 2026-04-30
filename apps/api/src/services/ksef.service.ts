import type { KsefEnvironment, PrismaClient } from '@prisma/client';
import { createKsefClient } from '@ksiegowy/ksef-client';
import { decrypt, encrypt } from '@ksiegowy/shared-utils';
import { buildFa3Xml } from '@ksiegowy/fa3-xml';
import type { InvoiceData } from '@ksiegowy/types';
import crypto from 'node:crypto';
import { buildIssuedInvoiceDataForKsefSubmission } from './invoice-ksef-submission.service.js';

// ── Session management ─────────────────────────────────────────────────────────

const SESSION_TTL_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

const resolveCompanyKsefEnvironment = (
  companyKsefEnvironment: KsefEnvironment | null | undefined
): KsefEnvironment => {
  return companyKsefEnvironment === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';
};

const toKsefClientEnvironment = (
  companyKsefEnvironment: KsefEnvironment
): 'test' | 'production' => {
  return companyKsefEnvironment === 'PRODUCTION' ? 'production' : 'test';
};

const loadCompanyKsefAuthConfiguration = async (
  prisma: PrismaClient,
  companyId: string,
  encryptionKey: string,
  selectedEnvironment: KsefEnvironment,
): Promise<{
  nip: string;
  selectedEnvironment: KsefEnvironment;
  ksefToken: string;
}> => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      nip: true,
      ksefEnv: true,
      ksefTokenEnc: true,
      ksefTokenIv: true,
      ksefCredentials: {
        where: { environment: selectedEnvironment },
        select: { tokenEnc: true, tokenIv: true },
      },
    },
  });

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const selectedCredential = company.ksefCredentials[0] ?? null;
  const selectedEnvironmentToken = selectedCredential
    ? decrypt(selectedCredential.tokenEnc, selectedCredential.tokenIv, encryptionKey)
    : null;
  const legacyToken = company.ksefEnv === selectedEnvironment && company.ksefTokenEnc && company.ksefTokenIv
    ? decrypt(company.ksefTokenEnc, company.ksefTokenIv, encryptionKey)
    : null;
  const environmentVariableToken = selectedEnvironment === 'TEST'
    ? process.env['KSEF_AUTH_TOKEN'] ?? null
    : null;
  const ksefToken = selectedEnvironmentToken ?? legacyToken ?? environmentVariableToken;

  if (!ksefToken) {
    throw new Error(`Company ${companyId} has no KSeF token configured for ${selectedEnvironment}`);
  }

  return {
    nip: company.nip,
    selectedEnvironment,
    ksefToken,
  };
};

/**
 * Returns a valid KSeF access token for the company.
 * The KsefSession table stores the encrypted refreshToken (v2).
 * - If a valid unexpired refreshToken exists, uses it to get a fresh accessToken.
 * - Otherwise, does a full re-authentication.
 */
export const getOrCreateKsefSession = async (
  prisma: PrismaClient,
  companyId: string,
  encryptionKey: string,
  selectedEnvironment: KsefEnvironment,
): Promise<string> => {
  const existing = await prisma.ksefSession.findUnique({
    where: {
      companyId_environment: {
        companyId,
        environment: selectedEnvironment,
      },
    },
  });

  if (existing) {
    const expiresWithBuffer = new Date(existing.expiresAt.getTime() - SESSION_TTL_BUFFER_MS);
    if (expiresWithBuffer > new Date()) {
      const refreshToken = decrypt(existing.tokenEnc, existing.tokenIv, encryptionKey);
      await prisma.ksefSession.update({
        where: {
          companyId_environment: {
            companyId,
            environment: selectedEnvironment,
          },
        },
        data: { lastUsedAt: new Date() }
      });

      const environment = toKsefClientEnvironment(selectedEnvironment);
      const client = createKsefClient({ environment });
      return client.refreshAuthSession(refreshToken);
    }
  }

  return initKsefSession(prisma, companyId, encryptionKey, selectedEnvironment);
};

/**
 * Performs full KSeF authentication using the company's encrypted API token.
 * Stores the refreshToken (encrypted) in the DB with its expiry.
 * Returns the accessToken for immediate use.
 */
export const initKsefSession = async (
  prisma: PrismaClient,
  companyId: string,
  encryptionKey: string,
  selectedEnvironment: KsefEnvironment,
): Promise<string> => {
  const companyKsefAuthConfiguration = await loadCompanyKsefAuthConfiguration(
    prisma,
    companyId,
    encryptionKey,
    selectedEnvironment,
  );
  const environment = toKsefClientEnvironment(companyKsefAuthConfiguration.selectedEnvironment);

  const client = createKsefClient({ environment });
  const authResult = await client.initAuthSession({
    ksefToken: companyKsefAuthConfiguration.ksefToken,
    nip: companyKsefAuthConfiguration.nip,
  });

  const refreshTokenExpiry = new Date(authResult.refreshTokenValidUntil);
  const { enc, iv } = encrypt(authResult.refreshToken, encryptionKey);

  await prisma.ksefSession.upsert({
    where: {
      companyId_environment: {
        companyId,
        environment: companyKsefAuthConfiguration.selectedEnvironment,
      },
    },
    create: {
      companyId,
      environment: companyKsefAuthConfiguration.selectedEnvironment,
      tokenEnc: enc,
      tokenIv: iv,
      expiresAt: refreshTokenExpiry,
      lastUsedAt: new Date()
    },
    update: { tokenEnc: enc, tokenIv: iv, expiresAt: refreshTokenExpiry, lastUsedAt: new Date() }
  });

  return authResult.accessToken;
};

// ── Submit invoice to KSeF ─────────────────────────────────────────────────────

export interface KsefSubmitResult {
  referenceNumber: string;
  sessionReferenceNumber: string;
  submissionId: string;
  ksefReference?: string;
}

/**
 * Submits an ISSUED invoice to KSeF (v2 flow):
 * - Gets/refreshes a valid accessToken
 * - Opens an online session, sends the encrypted FA(3) XML, closes the session
 * - Creates a KsefSubmission audit record
 * - Updates invoice.ksefStatus to SUBMITTED
 * - Re-authenticates on 401 and retries once
 */
export const submitInvoiceToKsef = async (
  prisma: PrismaClient,
  invoiceId: string,
  companyId: string,
  invoiceData: InvoiceData,
  encryptionKey: string,
  selectedEnvironment: KsefEnvironment,
): Promise<KsefSubmitResult> => {
  const environment = toKsefClientEnvironment(selectedEnvironment);
  const xmlString = buildFa3Xml(invoiceData);
  const requestHash = crypto.createHash('sha256').update(xmlString).digest('hex');

  const attemptCount = await prisma.ksefSubmission.count({
    where: { invoiceId, environment: selectedEnvironment }
  });
  const attemptNumber = attemptCount + 1;

  let submissionRecord = await prisma.ksefSubmission.create({
    data: {
      companyId,
      invoiceId,
      environment: selectedEnvironment,
      attemptNumber,
      status: 'PENDING',
      requestHash,
      submittedAt: new Date()
    }
  });

  const doSubmit = async (accessToken: string) => {
    const client = createKsefClient({ environment });
    return client.submitInvoice({ accessToken, xml: xmlString });
  };

  try {
    let accessToken = await getOrCreateKsefSession(prisma, companyId, encryptionKey, selectedEnvironment);
    let sendResult;

    try {
      sendResult = await doSubmit(accessToken);
    } catch (err: unknown) {
      const isUnauth = err instanceof Error &&
        (err.message.includes('401') || err.message.toLowerCase().includes('unauthori'));

      if (isUnauth) {
        accessToken = await initKsefSession(prisma, companyId, encryptionKey, selectedEnvironment);
        sendResult = await doSubmit(accessToken);
      } else {
        throw err;
      }
    }

    submissionRecord = await prisma.ksefSubmission.update({
      where: { id: submissionRecord.id },
      data: {
        status: 'SUBMITTED',
        referenceNumber: sendResult.invoiceRef,
        sessionReferenceNumber: sendResult.sessionRef,
        httpStatusCode: 202
      }
    });

    // The client polls KSeF before closing the session, so ksefReferenceNumber may already be available.
    const ksefReference = sendResult.ksefReferenceNumber;

    if (ksefReference) {
      await Promise.all([
        prisma.ksefSubmission.update({
          where: { id: submissionRecord.id },
          data: { status: 'ACCEPTED', ksefReference, acceptedAt: new Date() }
        }),
        prisma.invoice.update({
          where: { id: invoiceId },
          data: { ksefStatus: 'ACCEPTED', ksefReference, ksefAcceptedAt: new Date() }
        })
      ]);
    } else {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { ksefStatus: 'SUBMITTED', ksefSubmittedAt: new Date() }
      });
    }

    return {
      referenceNumber: sendResult.invoiceRef,
      sessionReferenceNumber: sendResult.sessionRef,
      submissionId: submissionRecord.id,
      ...(ksefReference ? { ksefReference } : {})
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await prisma.ksefSubmission.update({
      where: { id: submissionRecord.id },
      data: {
        status: 'ERROR',
        errorMessage,
        httpStatusCode: (err as { statusCode?: number }).statusCode ?? null
      }
    });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { ksefStatus: 'OFFLINE_QUEUED' }
    });

    throw err;
  }
};

// ── Offline queue retry ────────────────────────────────────────────────────────

/**
 * Finds all OFFLINE_QUEUED invoices across all companies and retries submission.
 * Called by the hourly cron job. Silently skips companies without a KSeF token.
 */
export const retryOfflineQueue = async (
  prisma: PrismaClient,
  encryptionKey: string,
  logger: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<void> => {
  const queued = await prisma.invoice.findMany({
    where: { ksefStatus: 'OFFLINE_QUEUED' },
    include: {
      lines: { orderBy: { position: 'asc' } },
      vatBreakdown: true,
      company: true,
      contractor: true
    }
  });

  if (queued.length === 0) return;

  logger.info({ count: queued.length }, 'KSeF offline retry: processing queued invoices');

  for (const invoice of queued) {
    if (!invoice.invoiceNumber || !invoice.contractor || !invoice.sellerNip || !invoice.buyerNip) {
      logger.info({ invoiceId: invoice.id }, 'KSeF offline retry: skipping invoice with missing data');
      continue;
    }

    const invoiceData = await buildIssuedInvoiceDataForKsefSubmission(prisma, invoice).catch((error) => {
      logger.info(
        { invoiceId: invoice.id, error: error instanceof Error ? error.message : String(error) },
        'KSeF offline retry: skipping invoice with invalid stored data'
      );
      return null;
    });

    if (!invoiceData) {
      continue;
    }

    await submitInvoiceToKsef(
      prisma,
      invoice.id,
      invoice.companyId,
      invoiceData,
      encryptionKey,
      resolveCompanyKsefEnvironment(invoice.company.ksefEnv),
    )
      .then(() => logger.info({ invoiceId: invoice.id }, 'KSeF offline retry: submission succeeded'))
      .catch((err: unknown) => logger.error({ invoiceId: invoice.id, err }, 'KSeF offline retry: submission failed'));
  }
};

// ── Poll submission status ─────────────────────────────────────────────────────

export interface KsefPollResult {
  status: 'accepted' | 'rejected' | 'pending';
  ksefReferenceNumber?: string;
}

const restoreAcceptedInvoiceStateFromSubmissionHistory = async (
  prisma: PrismaClient,
  input: {
    companyId: string;
    invoiceId: string;
    environment: KsefEnvironment;
    invoiceKsefStatus: string;
    invoiceKsefReference: string | null;
    invoiceKsefAcceptedAt: Date | null;
  }
): Promise<KsefPollResult | null> => {
  const acceptedSubmission = await prisma.ksefSubmission.findFirst({
    where: {
      companyId: input.companyId,
      invoiceId: input.invoiceId,
      environment: input.environment,
      status: 'ACCEPTED',
      ksefReference: { not: null }
    },
    orderBy: [{ acceptedAt: 'desc' }, { attemptNumber: 'desc' }],
    select: {
      ksefReference: true,
      acceptedAt: true
    }
  });

  if (!acceptedSubmission?.ksefReference) {
    return null;
  }

  if (
    input.invoiceKsefStatus !== 'ACCEPTED' ||
    input.invoiceKsefReference !== acceptedSubmission.ksefReference ||
    (input.invoiceKsefAcceptedAt?.getTime() ?? 0) !== (acceptedSubmission.acceptedAt?.getTime() ?? 0)
  ) {
    await prisma.invoice.update({
      where: { id: input.invoiceId },
      data: {
        ksefStatus: 'ACCEPTED',
        ksefReference: acceptedSubmission.ksefReference,
        ksefAcceptedAt: acceptedSubmission.acceptedAt ?? input.invoiceKsefAcceptedAt ?? new Date()
      }
    });
  }

  return {
    status: 'accepted',
    ksefReferenceNumber: acceptedSubmission.ksefReference
  };
};

/**
 * Polls the status of a KSeF submission.
 * Uses sessionReferenceNumber + referenceNumber (v2) from the submission record.
 * Status codes: 100 = processing, 200 = accepted, 400 = rejected
 */
export const pollKsefSubmissionStatus = async (
  prisma: PrismaClient,
  submissionId: string,
  companyId: string,
  encryptionKey: string
): Promise<KsefPollResult> => {
  const submission = await prisma.ksefSubmission.findUnique({
    where: { id: submissionId },
    include: {
      invoice: {
        select: {
          id: true,
          ksefStatus: true,
          ksefReference: true,
          ksefAcceptedAt: true
        }
      }
    }
  });

  if (!submission) throw new Error(`Submission ${submissionId} not found`);

  const restoredAcceptedState = await restoreAcceptedInvoiceStateFromSubmissionHistory(prisma, {
    companyId,
    invoiceId: submission.invoiceId,
    environment: submission.environment,
    invoiceKsefStatus: submission.invoice.ksefStatus,
    invoiceKsefReference: submission.invoice.ksefReference,
    invoiceKsefAcceptedAt: submission.invoice.ksefAcceptedAt
  });

  if (restoredAcceptedState) {
    return restoredAcceptedState;
  }

  if (!submission.referenceNumber) throw new Error('Submission has no referenceNumber to poll');
  if (!submission.sessionReferenceNumber) throw new Error('Submission has no sessionReferenceNumber to poll');

  const environment = toKsefClientEnvironment(submission.environment);
  const accessToken = await getOrCreateKsefSession(prisma, companyId, encryptionKey, submission.environment);
  const client = createKsefClient({ environment });

  const statusResult = await client.pollInvoiceStatus({
    accessToken,
    sessionRef: submission.sessionReferenceNumber,
    invoiceRef: submission.referenceNumber
  });

  if (statusResult.statusCode === 200) {
    const ksefRef = statusResult.ksefReferenceNumber ?? null;

    await prisma.ksefSubmission.update({
      where: { id: submissionId },
      data: { status: 'ACCEPTED', ksefReference: ksefRef, acceptedAt: new Date() }
    });

    await prisma.invoice.update({
      where: { id: submission.invoiceId },
      data: { ksefStatus: 'ACCEPTED', ksefReference: ksefRef, ksefAcceptedAt: new Date() }
    });

    return { status: 'accepted', ...(ksefRef ? { ksefReferenceNumber: ksefRef } : {}) };
  }

  if (statusResult.statusCode === 400) {
    await prisma.ksefSubmission.update({
      where: { id: submissionId },
      data: { status: 'REJECTED', errorMessage: 'Rejected by KSeF (status 400)' }
    });

    await prisma.invoice.update({
      where: { id: submission.invoiceId },
      data: { ksefStatus: 'REJECTED' }
    });

    return { status: 'rejected' };
  }

  return { status: 'pending' };
};
