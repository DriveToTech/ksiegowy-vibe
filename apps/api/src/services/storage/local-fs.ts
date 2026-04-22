import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { PrismaClient, FileRecord } from '@prisma/client';

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
  type: string;      // outgoing_pdf | outgoing_xml | incoming_scan
  ext: string;       // pdf | xml | jpg
  mimeType: string;
  data: Buffer;
  storageBase: string;
  date?: Date;
}

/**
 * Writes a file to disk and creates a FileRecord in the database.
 * Returns the created FileRecord.
 */
export const saveFile = async (
  prisma: PrismaClient,
  options: SaveFileOptions
): Promise<FileRecord> => {
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

  // Compute SHA-256 checksum
  const checksum = crypto.createHash('sha256').update(options.data).digest('hex');

  // Create FileRecord
  return prisma.fileRecord.create({
    data: {
      companyId: options.companyId,
      invoiceId: options.invoiceId ?? null,
      type: options.type,
      path: absolutePath,
      relativePath,
      mimeType: options.mimeType,
      sizeBytes: options.data.length,
      checksum
    }
  });
};

/**
 * Reads a file by its FileRecord and returns the Buffer.
 * Validates that the companyId matches to prevent cross-company access.
 */
export const readFile = async (
  prisma: PrismaClient,
  fileId: string,
  companyId: string
): Promise<{ record: FileRecord; data: Buffer }> => {
  const record = await prisma.fileRecord.findUnique({
    where: { id: fileId }
  });

  if (!record) {
    throw Object.assign(new Error('File not found'), { statusCode: 404 });
  }

  if (record.companyId !== companyId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  const data = await fs.readFile(record.path);

  return { record, data };
};
