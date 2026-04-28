import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { join } from 'node:path';
import { app } from 'electron';
import { readFile, writeFile, mkdir, unlink, readdir, access, stat } from 'node:fs/promises';

const algorithm = 'aes-256-gcm';
const ivLength = 16;
const authTagLength = 16;
const keyLength = 32;
const defaultCacheSubdirectory = 'encrypted-cache';

interface EncryptedCacheEntry {
  iv: string;
  authTag: string;
  encrypted: string;
  metadata?: Record<string, unknown>;
}

interface CacheEntryMetadata {
  createdAt: string;
  modifiedAt: string;
  size: number;
}

class EncryptedCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptedCacheError';
  }
}

async function getEncryptionKey(): Promise<Buffer> {
  const encryptionKeyEnv = process.env.DESKTOP_ENCRYPTION_KEY;

  if (encryptionKeyEnv) {
    const key = Buffer.from(encryptionKeyEnv, 'base64');
    if (key.length === keyLength) {
      return key;
    }
  }

  const appDataPath = app.getPath('userData');
  const keyFilePath = join(appDataPath, '.cache-encryption-key');

  try {
    const existingKey = await readFile(keyFilePath);
    if (existingKey.length === keyLength) {
      return existingKey;
    }
  } catch {
    // Key file doesn't exist or is invalid
  }

  const newKey = randomBytes(keyLength);
  await mkdir(appDataPath, { recursive: true });
  await writeFile(keyFilePath, newKey, { mode: 0o600 });

  return newKey;
}

function encryptData(plaintext: string, key: Buffer): EncryptedCacheEntry {
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, key, iv, { authTagLength });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    encrypted: encrypted.toString('base64')
  };
}

function decryptData(entry: EncryptedCacheEntry, key: Buffer): string {
  const iv = Buffer.from(entry.iv, 'base64');
  const authTag = Buffer.from(entry.authTag, 'base64');
  const encrypted = Buffer.from(entry.encrypted, 'base64');

  const decipher = createDecipheriv(algorithm, key, iv, { authTagLength });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function sanitizeCacheKey(key: string): string {
  const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '_');

  if (sanitized.length === 0 || sanitized.length > 255) {
    throw new EncryptedCacheError('Cache key must be between 1 and 255 characters');
  }

  return sanitized;
}

function getCacheDirectoryPath(subdirectory?: string): string {
  const basePath = app.getPath('userData');
  return join(basePath, subdirectory ?? defaultCacheSubdirectory);
}

function getCacheFilePath(key: string, subdirectory?: string): string {
  const sanitizedKey = sanitizeCacheKey(key);
  return join(getCacheDirectoryPath(subdirectory), `${sanitizedKey}.json`);
}

export async function setCacheEntry(
  key: string,
  data: unknown,
  options?: { subdirectory?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  if (!key) {
    throw new EncryptedCacheError('Cache key is required');
  }

  const cacheDirectory = getCacheDirectoryPath(options?.subdirectory);
  await mkdir(cacheDirectory, { recursive: true });

  const encryptionKey = await getEncryptionKey();
  const plaintext = JSON.stringify(data);
  const encryptedEntry = encryptData(plaintext, encryptionKey);

  if (options?.metadata) {
    encryptedEntry.metadata = options.metadata;
  }

  const filePath = getCacheFilePath(key, options?.subdirectory);
  await writeFile(filePath, JSON.stringify(encryptedEntry, null, 2), { mode: 0o600 });
}

export async function getCacheEntry<T = unknown>(
  key: string,
  options?: { subdirectory?: string }
): Promise<T | null> {
  if (!key) {
    throw new EncryptedCacheError('Cache key is required');
  }

  const filePath = getCacheFilePath(key, options?.subdirectory);

  try {
    const fileContent = await readFile(filePath, 'utf8');
    const encryptedEntry: EncryptedCacheEntry = JSON.parse(fileContent);

    const encryptionKey = await getEncryptionKey();
    const decrypted = decryptData(encryptedEntry, encryptionKey);

    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

export async function deleteCacheEntry(
  key: string,
  options?: { subdirectory?: string }
): Promise<boolean> {
  if (!key) {
    throw new EncryptedCacheError('Cache key is required');
  }

  const filePath = getCacheFilePath(key, options?.subdirectory);

  try {
    await access(filePath);
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function hasCacheEntry(
  key: string,
  options?: { subdirectory?: string }
): Promise<boolean> {
  if (!key) {
    throw new EncryptedCacheError('Cache key is required');
  }

  const filePath = getCacheFilePath(key, options?.subdirectory);

  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getCacheEntryMetadata(
  key: string,
  options?: { subdirectory?: string }
): Promise<CacheEntryMetadata | null> {
  if (!key) {
    throw new EncryptedCacheError('Cache key is required');
  }

  const filePath = getCacheFilePath(key, options?.subdirectory);

  try {
    const stats = await stat(filePath);
    return {
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
      size: stats.size
    };
  } catch {
    return null;
  }
}

export async function listCacheKeys(options?: { subdirectory?: string }): Promise<string[]> {
  const cacheDirectory = getCacheDirectoryPath(options?.subdirectory);

  try {
    await access(cacheDirectory);
  } catch {
    return [];
  }

  const entries = await readdir(cacheDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -5)); // Remove .json extension
}

export async function clearCache(options?: { subdirectory?: string }): Promise<number> {
  const cacheDirectory = getCacheDirectoryPath(options?.subdirectory);

  try {
    await access(cacheDirectory);
  } catch {
    return 0;
  }

  const entries = await readdir(cacheDirectory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));

  for (const file of files) {
    await unlink(join(cacheDirectory, file.name)).catch(() => {
      // Ignore errors when deleting individual files
    });
  }

  return files.length;
}

export async function getCacheSize(options?: { subdirectory?: string }): Promise<number> {
  const cacheDirectory = getCacheDirectoryPath(options?.subdirectory);

  try {
    await access(cacheDirectory);
  } catch {
    return 0;
  }

  const entries = await readdir(cacheDirectory, { withFileTypes: true });
  let totalSize = 0;

  for (const entry of entries) {
    if (entry.isFile()) {
      const stats = await stat(join(cacheDirectory, entry.name));
      totalSize += stats.size;
    }
  }

  return totalSize;
}

export async function cleanupExpiredEntries(
  maxAgeMs: number,
  options?: { subdirectory?: string }
): Promise<number> {
  const cacheDirectory = getCacheDirectoryPath(options?.subdirectory);

  try {
    await access(cacheDirectory);
  } catch {
    return 0;
  }

  const entries = await readdir(cacheDirectory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const now = Date.now();
  let deletedCount = 0;

  for (const file of files) {
    const filePath = join(cacheDirectory, file.name);
    const stats = await stat(filePath);

    if (now - stats.mtime.getTime() > maxAgeMs) {
      await unlink(filePath).catch(() => {
        // Ignore errors when deleting expired files
      });
      deletedCount++;
    }
  }

  return deletedCount;
}
