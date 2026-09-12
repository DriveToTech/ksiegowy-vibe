import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { KsefEnvironment, PrismaClient, FileRecord } from '@prisma/client';

// ── Path helpers ───────────────────────────────────────────────────────────────

export const expandStoragePath = (storagePath: string): string => {
  return path.resolve(storagePath.replace(/^~/, os.homedir()));
};

/**
 * Constructs: {base}/{companyId}/{type}/{year}/{month}/{uuid}.{ext}
 */
export const buildFilePath = (
  storageBase: string,
  companyId: string,
  type: 'outgoing' | 'incoming' | 'temp',
  ext: string,
  date: Date = new Date()
): { absolutePath: string; relativePath: string; uuid: string } => {
  const base = expandStoragePath(storageBase);
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const uuid = randomUUID();
  const filename = `${uuid}.${ext}`;
  const relative = path.join(companyId, type, String(year), month, filename);
  const absolute = path.join(base, relative);

  return { absolutePath: absolute, relativePath: relative, uuid };
};

// ── File write + FileRecord ────────────────────────────────────────────────────

export interface SaveFileOptions {
  companyId: string;
  invoiceId?: string;
  incomingInvoiceId?: string;
  environment?: KsefEnvironment;
  type: string;      // outgoing_pdf | outgoing_xml | incoming_scan
  ext: string;       // pdf | xml | jpg
  mimeType: string;
  data: Buffer;
  storageBase: string;
  date?: Date;
}

/**
 * A FileRecord is usable only when the bytes at its path still match the
 * recorded checksum and size. A database row alone is not an artifact.
 */
export const readAndVerifyStoredFile = async (
  record: Pick<FileRecord, 'path' | 'checksum' | 'sizeBytes'>,
): Promise<Buffer> => {
  if (!record.checksum) {
    throw new Error('Stored file is missing its checksum');
  }

  const data = await fs.readFile(record.path);
  const checksum = crypto.createHash('sha256').update(data).digest('hex');

  if (data.length !== record.sizeBytes || checksum !== record.checksum) {
    throw new Error('Stored file checksum does not match its FileRecord');
  }

  return data;
};

/**
 * Writes a file to disk and creates a FileRecord in the database.
 * Returns the created FileRecord.
 */
export const saveFile = async (
  prisma: PrismaClient,
  options: SaveFileOptions
): Promise<FileRecord> => {
  if (options.invoiceId && options.incomingInvoiceId) {
    throw new Error('A file cannot belong to both an outgoing and incoming invoice');
  }

  if (options.invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: options.invoiceId },
      select: { companyId: true, environment: true },
    });

    if (!invoice || invoice.companyId !== options.companyId) {
      throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
    }

    if (options.environment === undefined || invoice.environment !== options.environment) {
      throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
    }
  }

  if (options.incomingInvoiceId) {
    const incomingInvoice = await prisma.incomingInvoice.findUnique({
      where: { id: options.incomingInvoiceId },
      select: { companyId: true, environment: true },
    });

    if (
      !incomingInvoice ||
      incomingInvoice.companyId !== options.companyId ||
      options.environment === undefined ||
      incomingInvoice.environment !== options.environment
    ) {
      throw Object.assign(new Error('Incoming invoice not found'), { statusCode: 404 });
    }
  }

  const checksum = crypto.createHash('sha256').update(options.data).digest('hex');
  const storageParentId = options.invoiceId ?? options.incomingInvoiceId;
  const storageIdempotencyKey = storageParentId
    ? `${storageParentId}:${options.type}:${checksum}`
    : null;

  let existingRecordToReplace: FileRecord | null = null;

  if (storageIdempotencyKey) {
    const existingRecord = await prisma.fileRecord.findFirst({
      where: {
        companyId: options.companyId,
        ...(options.invoiceId ? { invoiceId: options.invoiceId } : {}),
        ...(options.incomingInvoiceId ? { incomingInvoiceId: options.incomingInvoiceId } : {}),
        type: options.type,
        checksum,
      },
    });

    if (existingRecord) {
      const existingRecordIsValid = await readAndVerifyStoredFile(existingRecord)
        .then(() => true)
        .catch(() => false);

      if (existingRecordIsValid) {
        return existingRecord;
      }

      existingRecordToReplace = existingRecord;
    }
  }

  const { absolutePath, relativePath } = buildFilePath(
    options.storageBase,
    options.companyId,
    options.type.startsWith('outgoing') ? 'outgoing' : 'incoming',
    options.ext,
    options.date
  );

  // Ensure directory exists
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  // Write file
  await fs.writeFile(absolutePath, options.data);

  const fileRecordData = {
    companyId: options.companyId,
    invoiceId: options.invoiceId ?? null,
    incomingInvoiceId: options.incomingInvoiceId ?? null,
    type: options.type,
    path: absolutePath,
    relativePath,
    mimeType: options.mimeType,
    sizeBytes: options.data.length,
    checksum,
    storageIdempotencyKey,
  };

  const replaceInvalidRecord = async (existingRecord: FileRecord): Promise<FileRecord> => {
    const existingRecordIsValid = await readAndVerifyStoredFile(existingRecord)
      .then(() => true)
      .catch(() => false);

    if (existingRecordIsValid) {
      await fs.unlink(absolutePath).catch(() => undefined);
      return existingRecord;
    }

    return prisma.fileRecord.update({
      where: { id: existingRecord.id },
      data: fileRecordData,
    }).catch(async (error: unknown) => {
      await fs.unlink(absolutePath).catch(() => undefined);
      throw error;
    });
  };

  if (existingRecordToReplace) {
    return replaceInvalidRecord(existingRecordToReplace);
  }

  return prisma.fileRecord.create({
    data: fileRecordData,
  }).catch(async (error: unknown) => {
    if (!storageIdempotencyKey || !isUniqueConstraintViolation(error)) {
      await fs.unlink(absolutePath).catch(() => undefined);
      throw error;
    }

    const existingRecord = await prisma.fileRecord.findUnique({
      where: { storageIdempotencyKey },
    });

    if (!existingRecord) {
      await fs.unlink(absolutePath).catch(() => undefined);
      throw error;
    }

    return replaceInvalidRecord(existingRecord);
  });
};

const isUniqueConstraintViolation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === 'P2002';
};

/**
 * Reads a file by its FileRecord and returns the Buffer.
 * Validates that the companyId matches to prevent cross-company access.
 */
export const readFile = async (
  prisma: PrismaClient,
  fileId: string,
  companyId: string,
  environment?: KsefEnvironment,
): Promise<{ record: FileRecord; data: Buffer }> => {
  const record = await prisma.fileRecord.findUnique({
    where: { id: fileId },
    include: {
      invoice: { select: { companyId: true, environment: true } },
      incomingInvoice: { select: { companyId: true, environment: true } },
    },
  });

  if (!record) {
    throw Object.assign(new Error('File not found'), { statusCode: 404 });
  }

  if (record.companyId !== companyId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  const parent = record.invoice ?? record.incomingInvoice;
  if (!parent) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  if (parent && (parent.companyId !== companyId || environment === undefined || parent.environment !== environment)) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  const data = await readAndVerifyStoredFile(record);

  return { record, data };
};
