import type { FileRecord, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile, saveFile } from './local-fs.js';

const createdStorageDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdStorageDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('saveFile()', () => {
  it('does not save an invoice file without a matching environment', async () => {
    const prisma = {
      invoice: {
        findUnique: vi.fn(async () => ({ companyId: 'company-1', environment: 'TEST' })),
      },
    } as unknown as PrismaClient;

    await expect(
      saveFile(prisma, {
        companyId: 'company-1',
        invoiceId: 'invoice-1',
        environment: 'PRODUCTION',
        type: 'outgoing_pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        data: Buffer.from('invoice'),
        storageBase: '/tmp/unused-storage',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns the existing record for the same invoice file content', async () => {
    const storageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ksiegowy-storage-'));
    createdStorageDirectories.push(storageDirectory);

    let existingFileRecord: FileRecord | null = null;
    const fileRecordFindFirst = vi.fn(async () => existingFileRecord);
    const fileRecordCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      existingFileRecord = { id: 'file-1', ...data } as unknown as FileRecord;
      return existingFileRecord;
    });
    const fileRecordUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      existingFileRecord = { ...existingFileRecord, ...data } as unknown as FileRecord;
      return existingFileRecord;
    });
    const prisma = {
      invoice: {
        findUnique: vi.fn(async () => ({ companyId: 'company-1', environment: 'TEST' })),
      },
      fileRecord: {
        findFirst: fileRecordFindFirst,
        create: fileRecordCreate,
        update: fileRecordUpdate,
      },
    } as unknown as PrismaClient;
    const options = {
      companyId: 'company-1',
      invoiceId: 'invoice-1',
      environment: 'TEST' as const,
      type: 'outgoing_pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      data: Buffer.from('invoice'),
      storageBase: storageDirectory,
    };

    await saveFile(prisma, options);
    const secondResult = await saveFile(prisma, options);

    expect(secondResult).toBe(existingFileRecord);
    expect(fileRecordCreate).toHaveBeenCalledOnce();
  });

  it.each([
    { description: 'missing', prepare: async (_filePath: string) => undefined },
    {
      description: 'corrupt',
      prepare: async (filePath: string) => fs.writeFile(filePath, 'corrupt invoice'),
    },
  ])('replaces a $description artifact instead of reusing it', async ({ prepare }) => {
    const storageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ksiegowy-storage-'));
    createdStorageDirectories.push(storageDirectory);
    const expectedData = Buffer.from('invoice');
    const checksum = createHash('sha256').update(expectedData).digest('hex');
    const stalePath = path.join(storageDirectory, 'stale.pdf');
    await prepare(stalePath);

    const staleFileRecord = {
      id: 'file-1',
      path: stalePath,
      checksum,
      sizeBytes: expectedData.length,
    } as unknown as FileRecord;
    const fileRecordUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...staleFileRecord,
      ...data,
    })) as unknown as (input: { data: Record<string, unknown> }) => Promise<FileRecord>;
    const prisma = {
      invoice: {
        findUnique: vi.fn(async () => ({ companyId: 'company-1', environment: 'TEST' })),
      },
      fileRecord: {
        findFirst: vi.fn(async () => staleFileRecord),
        create: vi.fn(),
        update: fileRecordUpdate,
      },
    } as unknown as PrismaClient;

    const result = await saveFile(prisma, {
      companyId: 'company-1',
      invoiceId: 'invoice-1',
      environment: 'TEST',
      type: 'outgoing_pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      data: expectedData,
      storageBase: storageDirectory,
    });

    expect(fileRecordUpdate).toHaveBeenCalledOnce();
    expect(result.checksum).toBe(checksum);
    await expect(fs.readFile(result.path)).resolves.toEqual(expectedData);
  });
});

describe('readFile()', () => {
  it('rejects a parent file when the selected environment does not match', async () => {
    const prisma = {
      fileRecord: {
        findUnique: vi.fn(async () => ({
          companyId: 'company-1',
          invoiceId: 'invoice-1',
          incomingInvoiceId: null,
          path: '/tmp/unused-file',
          invoice: { companyId: 'company-1', environment: 'TEST' },
          incomingInvoice: null,
        })),
      },
    } as unknown as PrismaClient;

    await expect(readFile(prisma, 'file-1', 'company-1', 'PRODUCTION')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
