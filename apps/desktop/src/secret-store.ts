import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import { join } from 'node:path';
import { app } from 'electron';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';

const algorithm = 'aes-256-gcm';
const ivLength = 16;
const authTagLength = 16;
const keyLength = 32;

interface EncryptedSecret {
  iv: string;
  authTag: string;
  encrypted: string;
}

interface SecretStoreEntry {
  account: string;
  secret: string;
}

class SecretStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreError';
  }
}

function getEncryptionKey(): Buffer {
  const encryptionKeyEnv = process.env.DESKTOP_ENCRYPTION_KEY;

  if (encryptionKeyEnv) {
    const key = Buffer.from(encryptionKeyEnv, 'base64');
    if (key.length === keyLength) {
      return key;
    }
  }

  const appPath = app.getPath('userData');
  const keyFilePath = join(appPath, '.secret-store-key');

  try {
    const existingKey = readFileSync(keyFilePath);
    if (existingKey.length === keyLength) {
      return existingKey;
    }
  } catch {
    // Key file doesn't exist or is invalid, generate new key
  }

  const newKey = randomBytes(keyLength);
  mkdirSync(appPath, { recursive: true });
  writeFileSync(keyFilePath, newKey, { mode: 0o600 });

  return newKey;
}

function encryptSecret(plaintext: string, key: Buffer): EncryptedSecret {
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

function decryptSecret(encryptedData: EncryptedSecret, key: Buffer): string {
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  const encrypted = Buffer.from(encryptedData.encrypted, 'base64');

  const decipher = createDecipheriv(algorithm, key, iv, { authTagLength });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function getStoreFilePath(): string {
  return join(app.getPath('userData'), 'secret-store.json');
}

async function loadStore(): Promise<Map<string, SecretStoreEntry>> {
  const storePath = getStoreFilePath();

  try {
    await access(storePath);
    const data = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(data) as Record<string, SecretStoreEntry>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

async function saveStore(store: Map<string, SecretStoreEntry>): Promise<void> {
  const storePath = getStoreFilePath();
  const appDataPath = app.getPath('userData');

  await mkdir(appDataPath, { recursive: true });

  const data = JSON.stringify(Object.fromEntries(store), null, 2);
  await writeFile(storePath, data, { mode: 0o600 });
}

function getStoreKey(service: string, account: string): string {
  return `${service}:${account}`;
}

export async function setSecret(service: string, account: string, secret: string): Promise<void> {
  if (!service || !account || !secret) {
    throw new SecretStoreError('Service, account, and secret are required');
  }

  const store = await loadStore();
  const key = getEncryptionKey();
  const encrypted = encryptSecret(secret, key);

  store.set(getStoreKey(service, account), {
    account,
    secret: JSON.stringify(encrypted)
  });

  await saveStore(store);
}

export async function getSecret(service: string, account: string): Promise<string | null> {
  if (!service || !account) {
    throw new SecretStoreError('Service and account are required');
  }

  const store = await loadStore();
  const entry = store.get(getStoreKey(service, account));

  if (!entry) {
    return null;
  }

  try {
    const key = getEncryptionKey();
    const encryptedData = JSON.parse(entry.secret) as EncryptedSecret;
    return decryptSecret(encryptedData, key);
  } catch {
    return null;
  }
}

export async function deleteSecret(service: string, account: string): Promise<boolean> {
  if (!service || !account) {
    throw new SecretStoreError('Service and account are required');
  }

  const store = await loadStore();
  const key = getStoreKey(service, account);
  const existed = store.has(key);

  store.delete(key);
  await saveStore(store);

  return existed;
}

export async function findSecrets(service: string): Promise<Array<{ account: string; secret: string }>> {
  if (!service) {
    throw new SecretStoreError('Service is required');
  }

  const store = await loadStore();
  const key = getEncryptionKey();
  const results: Array<{ account: string; secret: string }> = [];

  for (const [storeKey, entry] of store) {
    if (storeKey.startsWith(`${service}:`)) {
      try {
        const encryptedData = JSON.parse(entry.secret) as EncryptedSecret;
        const secret = decryptSecret(encryptedData, key);
        results.push({ account: entry.account, secret });
      } catch {
        // Skip entries that fail to decrypt
      }
    }
  }

  return results;
}

export async function findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
  const secrets = await findSecrets(service);
  return secrets.map(({ account, secret }) => ({ account, password: secret }));
}

// Sync versions for internal use
function readFileSync(path: string): Buffer {
  const fs = require('node:fs');
  return fs.readFileSync(path);
}

function writeFileSync(path: string, data: Buffer, options?: { mode?: number }): void {
  const fs = require('node:fs');
  fs.writeFileSync(path, data, options);
}

function mkdirSync(path: string, options?: { recursive?: boolean }): void {
  const fs = require('node:fs');
  fs.mkdirSync(path, options);
}
