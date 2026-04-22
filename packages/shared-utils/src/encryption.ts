import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256-bit

/**
 * Validates and returns the encryption key as a 32-byte Buffer.
 * Key must be a 64-char hex string (ENCRYPTION_KEY env var).
 */
export const parseEncryptionKey = (hexKey: string): Buffer => {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${key.length} bytes`);
  }
  return key;
};

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns { enc: base64Ciphertext, iv: base64IV }.
 * The auth tag is appended to the ciphertext.
 */
export const encrypt = (plaintext: string, keyHex: string): { enc: string; iv: string } => {
  const key = parseEncryptionKey(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Append auth tag to ciphertext
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    enc: combined.toString('base64'),
    iv: iv.toString('base64')
  };
};

/**
 * Decrypts a value previously encrypted with `encrypt`.
 */
export const decrypt = (encBase64: string, ivBase64: string, keyHex: string): string => {
  const key = parseEncryptionKey(keyHex);
  const iv = Buffer.from(ivBase64, 'base64');
  const combined = Buffer.from(encBase64, 'base64');

  // Split ciphertext and auth tag
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final('utf8');
};
