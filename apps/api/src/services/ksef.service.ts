import type { KsefEnvironment, PrismaClient } from '@prisma/client';
import { createKsefClient } from '@ksiegowy/ksef-client';
import { decrypt, encrypt } from '@ksiegowy/shared-utils';
import { buildFa3Xml } from '@ksiegowy/fa3-xml';
import type { InvoiceData } from '@ksiegowy/types';
import crypto from 'node:crypto';
import { buildIssuedInvoiceDataForKsefSubmission } from './invoice-ksef-submission.service.js';

// ── Session management ─────────────────────────────────────────────────────────

const SESSION_TTL_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

const toKsefClientEnvironment = (
  companyKsefEnvironment: KsefEnvironment
): 'test' | 'production' => {
  return companyKsefEnvironment === 'PRODUCTION' ? 'production' : 'test';
};

export const upsertInvoiceKsefState = async (
  prisma: PrismaClient,
  input: {
    invoiceId: string;
    environment: KsefEnvironment;
    status: 'NOT_SENT' | 'QUEUED' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'OFFLINE_QUEUED';
    ksefReference?: string | null;
    submittedAt?: Date | null;
    acceptedAt?: Date | null;
    lastSubmissionId?: string | null;
  }
): Promise<void> => {
  if (input.status === 'ACCEPTED' && !input.ksefReference?.trim()) {
    throw new Error('KSeF ACCEPTED state requires a non-empty ksefReference');
  }

  const createData = {
    invoiceId: input.invoiceId,
    environment: input.environment,
    status: input.status,
    ksefReference: input.ksefReference ?? null,
    ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
    ...(input.acceptedAt !== undefined ? { acceptedAt: input.acceptedAt } : {}),
    ...(input.lastSubmissionId !== undefined ? { lastSubmissionId: input.lastSubmissionId } : {}),
  };
  const updateData = {
    status: input.status,
    ksefReference: input.ksefReference ?? null,
    ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
    ...(input.acceptedAt !== undefined ? { acceptedAt: input.acceptedAt } : {}),
    ...(input.lastSubmissionId !== undefined ? { lastSubmissionId: input.lastSubmissionId } : {}),
  };

  await prisma.invoiceKsefState.upsert({
    where: {
      invoiceId_environment: {
        invoiceId: input.invoiceId,
        environment: input.environment,
      },
    },
    create: createData,
    update: updateData,
  });
};

export const loadCompanyKsefAuthConfiguration = async (
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

export class KsefSubmissionConflictError extends Error {
  public readonly statusCode = 409;

  public constructor(message: string) {
    super(message);
    this.name = 'KsefSubmissionConflictError';
  }
}

export class KsefManualReconciliationRequiredError extends Error {
  public readonly statusCode = 409;

  public constructor(message: string) {
    super(message);
    this.name = 'KsefManualReconciliationRequiredError';
  }
}

const getErrorStatusCode = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null;
  }

  return typeof error.statusCode === 'number' ? error.statusCode : null;
};

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
  options: { retryOfflineQueue?: boolean } = {},
): Promise<KsefSubmitResult> => {
  const environment = toKsefClientEnvironment(selectedEnvironment);
  const xmlString = buildFa3Xml(invoiceData);
  const requestHash = crypto.createHash('sha256').update(xmlString).digest('hex');

  let submissionRecord = await prisma.$transaction(async (transactionClient) => {
    const lockedInvoice = await transactionClient.$queryRaw<Array<{ id: string; ksef_status: string }>>`
      SELECT id, "ksefStatus" AS ksef_status
      FROM "Invoice"
      WHERE id = ${invoiceId}
        AND "companyId" = ${companyId}
        AND environment = ${selectedEnvironment}::"KsefEnvironment"
      FOR UPDATE
    `;

    if (lockedInvoice.length === 0) {
      throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);
    }

    const currentState = await transactionClient.invoiceKsefState.findUnique({
      where: { invoiceId_environment: { invoiceId, environment: selectedEnvironment } },
      select: { status: true, lastSubmissionId: true },
    });

    const currentStatus = currentState?.status ?? lockedInvoice[0]!.ksef_status;

    if (currentStatus !== 'NOT_SENT') {
      const previousSubmission = currentState?.lastSubmissionId
          ? await transactionClient.ksefSubmission.findUnique({
              where: { id: currentState.lastSubmissionId },
            select: { status: true, externalMutationStarted: true },
          })
        : null;

      if (
        !options.retryOfflineQueue ||
        currentState?.status !== 'OFFLINE_QUEUED' ||
        previousSubmission?.status !== 'ERROR' ||
        previousSubmission?.externalMutationStarted !== false
      ) {
        throw new KsefSubmissionConflictError(
          `Invoice ${invoiceId} already has a KSeF submission in progress or completed for ${selectedEnvironment}`
        );
      }
    }

    const attemptCount = await transactionClient.ksefSubmission.count({
      where: { invoiceId, environment: selectedEnvironment }
    });
    const submission = await transactionClient.ksefSubmission.create({
      data: {
        companyId,
        invoiceId,
        environment: selectedEnvironment,
        attemptNumber: attemptCount + 1,
        status: 'PENDING',
        requestHash,
        externalMutationStarted: false,
        submittedAt: new Date()
      }
    });

    await transactionClient.invoiceKsefState.upsert({
      where: { invoiceId_environment: { invoiceId, environment: selectedEnvironment } },
      create: {
        invoiceId,
        environment: selectedEnvironment,
        status: 'OFFLINE_QUEUED',
        lastSubmissionId: submission.id,
      },
      update: {
        status: 'OFFLINE_QUEUED',
        lastSubmissionId: submission.id,
      },
    });

    return submission;
  });

  const doSubmit = async (accessToken: string) => {
    const client = createKsefClient({ environment });
    return client.submitInvoice({ accessToken, xml: xmlString });
  };

  let externalMutationStarted = false;

  try {
    let accessToken = await getOrCreateKsefSession(prisma, companyId, encryptionKey, selectedEnvironment);
    let sendResult;

    try {
      await prisma.ksefSubmission.update({
        where: { id: submissionRecord.id },
        data: { externalMutationStarted: true },
      });
      externalMutationStarted = true;
      sendResult = await doSubmit(accessToken);
    } catch (err: unknown) {
      const isUnauth = err instanceof Error &&
        (err.message.includes('401') || err.message.toLowerCase().includes('unauthori'));

      if (isUnauth) {
        await prisma.ksefSubmission.update({
          where: { id: submissionRecord.id },
          data: { externalMutationStarted: false },
        });
        externalMutationStarted = false;
        accessToken = await initKsefSession(prisma, companyId, encryptionKey, selectedEnvironment);
        await prisma.ksefSubmission.update({
          where: { id: submissionRecord.id },
          data: { externalMutationStarted: true },
        });
        externalMutationStarted = true;
        sendResult = await doSubmit(accessToken);
      } else {
        throw err;
      }
    }

    submissionRecord = await prisma.$transaction(async (transactionClient) => {
      const updatedSubmission = await transactionClient.ksefSubmission.update({
        where: { id: submissionRecord.id },
        data: {
          status: 'SUBMITTED',
          referenceNumber: sendResult.invoiceRef,
          sessionReferenceNumber: sendResult.sessionRef,
          httpStatusCode: 202
        }
      });

      await transactionClient.invoiceKsefState.upsert({
        where: { invoiceId_environment: { invoiceId, environment: selectedEnvironment } },
        create: {
          invoiceId,
          environment: selectedEnvironment,
          status: 'SUBMITTED',
          submittedAt: updatedSubmission.submittedAt ?? new Date(),
          lastSubmissionId: updatedSubmission.id,
        },
        update: {
          status: 'SUBMITTED',
          submittedAt: updatedSubmission.submittedAt ?? new Date(),
          lastSubmissionId: updatedSubmission.id,
        },
      });

      return updatedSubmission;
    });

    // The client polls KSeF before closing the session, so ksefReferenceNumber may already be available.
    const ksefReference = sendResult.ksefReferenceNumber?.trim() || undefined;

    if (ksefReference) {
      const acceptedAt = new Date();
      await prisma.$transaction(async (transactionClient) => {
        await transactionClient.ksefSubmission.update({
          where: { id: submissionRecord.id },
          data: { status: 'ACCEPTED', ksefReference, acceptedAt }
        });
        // LEGACY: parallel write for rollout compatibility
        await transactionClient.invoice.update({
          where: { id: invoiceId },
          data: { ksefStatus: 'ACCEPTED', ksefReference, ksefAcceptedAt: acceptedAt }
        });
        await transactionClient.invoiceKsefState.upsert({
          where: { invoiceId_environment: { invoiceId, environment: selectedEnvironment } },
          create: {
            invoiceId,
            environment: selectedEnvironment,
            status: 'ACCEPTED',
            ksefReference,
            submittedAt: submissionRecord.submittedAt ?? new Date(),
            acceptedAt,
            lastSubmissionId: submissionRecord.id,
          },
          update: {
            status: 'ACCEPTED',
            ksefReference,
            submittedAt: submissionRecord.submittedAt ?? new Date(),
            acceptedAt,
            lastSubmissionId: submissionRecord.id,
          },
        });
      });
    } else {
        // LEGACY: parallel write for rollout compatibility
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
    const canRetrySafely = !externalMutationStarted;
    const storedErrorMessage = canRetrySafely
      ? errorMessage
      : `Ambiguous KSeF submission outcome: ${errorMessage}`;
    const invoiceKsefStatus = canRetrySafely ? 'OFFLINE_QUEUED' : 'SUBMITTED';
    const submissionStatus = canRetrySafely ? 'ERROR' : 'PENDING';

    await prisma.$transaction(async (transactionClient) => {
      await transactionClient.ksefSubmission.update({
        where: { id: submissionRecord.id },
        data: {
          status: submissionStatus,
          errorMessage: storedErrorMessage,
          httpStatusCode: getErrorStatusCode(err)
        }
      });

      // LEGACY: parallel write for rollout compatibility
      await transactionClient.invoice.update({
        where: { id: invoiceId },
        data: { ksefStatus: invoiceKsefStatus }
      });

      await transactionClient.invoiceKsefState.upsert({
        where: { invoiceId_environment: { invoiceId, environment: selectedEnvironment } },
        create: {
          invoiceId,
          environment: selectedEnvironment,
          status: invoiceKsefStatus,
          lastSubmissionId: submissionRecord.id,
        },
        update: {
          status: invoiceKsefStatus,
          lastSubmissionId: submissionRecord.id,
        },
      });
    });

    throw err;
  }
};

export const attachKsefSubmissionReferences = async (
  prisma: PrismaClient,
  invoiceId: string,
  companyId: string,
  selectedEnvironment: KsefEnvironment,
  sessionReferenceNumber: string,
  referenceNumber: string,
): Promise<string> => {
  const normalizedSessionReferenceNumber = sessionReferenceNumber.trim();
  const normalizedReferenceNumber = referenceNumber.trim();
  if (!normalizedSessionReferenceNumber || !normalizedReferenceNumber) {
    throw new Error('Both KSeF sessionReferenceNumber and referenceNumber are required');
  }

  return prisma.$transaction(async (transactionClient) => {
    const lockedInvoice = await transactionClient.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Invoice"
      WHERE id = ${invoiceId}
        AND "companyId" = ${companyId}
        AND environment = ${selectedEnvironment}::"KsefEnvironment"
      FOR UPDATE
    `;
    if (lockedInvoice.length === 0) throw new Error(`Invoice ${invoiceId} not found for company ${companyId}`);

    const submission = await transactionClient.ksefSubmission.findFirst({
      where: {
        invoiceId,
        companyId,
        environment: selectedEnvironment,
        status: { in: ['PENDING', 'SUBMITTED', 'ERROR'] },
        ksefReference: null,
      },
      orderBy: { attemptNumber: 'desc' },
    });
    if (!submission) throw new KsefManualReconciliationRequiredError(
      `Invoice ${invoiceId} has no ambiguous KSeF submission to reconcile`
    );

    const updatedSubmission = await transactionClient.ksefSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'SUBMITTED',
        referenceNumber: normalizedReferenceNumber,
        sessionReferenceNumber: normalizedSessionReferenceNumber,
        errorMessage: null,
      },
    });

    await transactionClient.invoice.update({
      where: { id: invoiceId },
      data: { ksefStatus: 'SUBMITTED' },
    });
    await transactionClient.invoiceKsefState.upsert({
      where: { invoiceId_environment: { invoiceId, environment: selectedEnvironment } },
      create: {
        invoiceId,
        environment: selectedEnvironment,
        status: 'SUBMITTED',
        lastSubmissionId: submission.id,
      },
      update: {
        status: 'SUBMITTED',
        lastSubmissionId: submission.id,
      },
    });

    return updatedSubmission.id;
  });
};

// ── Offline queue retry ────────────────────────────────────────────────────────

export const reconcilePendingKsefSubmissions = async (
  prisma: PrismaClient,
  encryptionKey: string,
  logger: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
): Promise<void> => {
  const pendingSubmissions = await prisma.ksefSubmission.findMany({
    where: { status: 'PENDING' },
    select: {
      id: true,
      companyId: true,
      invoiceId: true,
      environment: true,
      referenceNumber: true,
      sessionReferenceNumber: true,
    },
  });

  for (const submission of pendingSubmissions) {
    if (!submission.referenceNumber || !submission.sessionReferenceNumber) {
      await prisma.ksefSubmission.update({
        where: { id: submission.id },
        data: {
          errorMessage: 'Manual reconciliation required: KSeF references were not persisted before the process stopped',
        },
      });
      logger.error(
        { submissionId: submission.id, invoiceId: submission.invoiceId },
        'KSeF pending submission requires manual reconciliation; it was not resubmitted',
      );
      continue;
    }

    await pollKsefSubmissionStatus(prisma, submission.id, submission.companyId, encryptionKey)
      .then((result) => logger.info(
        { submissionId: submission.id, invoiceId: submission.invoiceId, status: result.status },
        'KSeF pending submission reconciled',
      ))
      .catch((error: unknown) => logger.error(
        { submissionId: submission.id, invoiceId: submission.invoiceId, error: error instanceof Error ? error.message : String(error) },
        'KSeF pending submission reconciliation failed; it was not resubmitted',
      ));
  }
};

/**
 * Finds all OFFLINE_QUEUED invoices across all companies and retries submission.
 * Called by the hourly cron job. Silently skips companies without a KSeF token.
 */
export const retryOfflineQueue = async (
  prisma: PrismaClient,
  encryptionKey: string,
  logger: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<void> => {
  await reconcilePendingKsefSubmissions(prisma, encryptionKey, logger);

  const queuedStates = await prisma.invoiceKsefState.findMany({
    where: { status: 'OFFLINE_QUEUED' },
    include: {
      lastSubmission: { select: { status: true, externalMutationStarted: true } },
      invoice: {
        include: {
          lines: { orderBy: { position: 'asc' } },
          vatBreakdown: true,
          company: true,
          contractor: true,
        },
      },
    }
  });

  if (queuedStates.length === 0) return;

  logger.info({ count: queuedStates.length }, 'KSeF offline retry: processing queued invoices');

  for (const queuedState of queuedStates) {
    const invoice = queuedState.invoice;

    if (
      queuedState.lastSubmission?.status === 'PENDING' ||
      queuedState.lastSubmission?.externalMutationStarted
    ) {
      logger.error(
        { invoiceId: invoice.id },
        'KSeF offline retry: submission has an ambiguous outcome and was not retried'
      );
      continue;
    }

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
      queuedState.environment,
      { retryOfflineQueue: true },
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
    await upsertInvoiceKsefState(prisma, {
      invoiceId: input.invoiceId,
      environment: input.environment,
      status: 'ACCEPTED',
      ksefReference: acceptedSubmission.ksefReference,
      acceptedAt: acceptedSubmission.acceptedAt ?? input.invoiceKsefAcceptedAt ?? new Date(),
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
          companyId: true,
          environment: true,
          ksefStatus: true,
          ksefReference: true,
          ksefAcceptedAt: true
        }
      }
    }
  });

  if (!submission) throw new Error(`Submission ${submissionId} not found`);

  if (
    submission.companyId !== companyId ||
    submission.invoice.companyId !== companyId ||
    submission.invoice.environment !== submission.environment
  ) {
    throw new Error(`Submission ${submissionId} not found`);
  }

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

  if (!submission.referenceNumber || !submission.sessionReferenceNumber) {
    throw new KsefManualReconciliationRequiredError(
      `Submission ${submissionId} has no KSeF session and invoice references; provide them through manual reconciliation before polling`
    );
  }

  const environment = toKsefClientEnvironment(submission.environment);
  const accessToken = await getOrCreateKsefSession(prisma, companyId, encryptionKey, submission.environment);
  const client = createKsefClient({ environment });

  const statusResult = await client.pollInvoiceStatus({
    accessToken,
    sessionRef: submission.sessionReferenceNumber,
    invoiceRef: submission.referenceNumber
  });

  if (statusResult.statusCode === 200) {
    const ksefRef = statusResult.ksefReferenceNumber?.trim() ?? null;
    if (!ksefRef) {
      await prisma.$transaction(async (transactionClient) => {
        await transactionClient.ksefSubmission.update({
          where: { id: submissionId },
          data: {
            status: 'SUBMITTED',
            errorMessage: 'KSeF returned an accepted status without ksefReference; manual reconciliation is required',
          },
        });
        await transactionClient.invoice.update({
          where: { id: submission.invoiceId },
          data: { ksefStatus: 'SUBMITTED' },
        });
        await transactionClient.invoiceKsefState.upsert({
          where: { invoiceId_environment: { invoiceId: submission.invoiceId, environment: submission.environment } },
          create: {
            invoiceId: submission.invoiceId,
            environment: submission.environment,
            status: 'SUBMITTED',
            submittedAt: submission.submittedAt,
            lastSubmissionId: submissionId,
          },
          update: {
            status: 'SUBMITTED',
            submittedAt: submission.submittedAt,
            lastSubmissionId: submissionId,
          },
        });
      });
      return { status: 'pending' };
    }
    const acceptedAt = new Date();

    await prisma.$transaction(async (transactionClient) => {
      await transactionClient.ksefSubmission.update({
        where: { id: submissionId },
        data: { status: 'ACCEPTED', ksefReference: ksefRef, acceptedAt }
      });
      await transactionClient.invoice.update({
        where: { id: submission.invoiceId },
        data: {
          ksefStatus: 'ACCEPTED',
          ksefReference: ksefRef,
          ksefAcceptedAt: acceptedAt,
        },
      });
      await transactionClient.invoiceKsefState.upsert({
        where: { invoiceId_environment: { invoiceId: submission.invoiceId, environment: submission.environment } },
        create: {
          invoiceId: submission.invoiceId,
          environment: submission.environment,
          status: 'ACCEPTED',
          ksefReference: ksefRef,
          acceptedAt,
          lastSubmissionId: submissionId,
        },
        update: {
          status: 'ACCEPTED',
          ksefReference: ksefRef,
          acceptedAt,
          lastSubmissionId: submissionId,
        },
      });
    });

    return { status: 'accepted', ...(ksefRef ? { ksefReferenceNumber: ksefRef } : {}) };
  }

  if (statusResult.statusCode === 400) {
    await prisma.$transaction(async (transactionClient) => {
      await transactionClient.ksefSubmission.update({
        where: { id: submissionId },
        data: { status: 'REJECTED', errorMessage: 'Rejected by KSeF (status 400)' }
      });
      await transactionClient.invoice.update({
        where: { id: submission.invoiceId },
        data: { ksefStatus: 'REJECTED' },
      });
      await transactionClient.invoiceKsefState.upsert({
        where: { invoiceId_environment: { invoiceId: submission.invoiceId, environment: submission.environment } },
        create: {
          invoiceId: submission.invoiceId,
          environment: submission.environment,
          status: 'REJECTED',
          lastSubmissionId: submissionId,
        },
        update: {
          status: 'REJECTED',
          lastSubmissionId: submissionId,
        },
      });
    });

    return { status: 'rejected' };
  }

  return { status: 'pending' };
};
