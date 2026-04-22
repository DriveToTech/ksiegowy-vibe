import { describe, expect, it } from 'vitest';

import { decrypt, encrypt, parseEncryptionKey } from './encryption.js';

const VALID_KEY = 'a'.repeat(64); // 64-char hex → 32 bytes

describe('parseEncryptionKey()', () => {
  it('accepts a valid 64-char hex key and returns a 32-byte Buffer', () => {
    const key = parseEncryptionKey(VALID_KEY);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('throws when key is too short', () => {
    expect(() => parseEncryptionKey('a'.repeat(32))).toThrow(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes), got 16 bytes'
    );
  });

  it('throws when key is too long', () => {
    expect(() => parseEncryptionKey('a'.repeat(128))).toThrow();
  });

  it('throws for empty string', () => {
    expect(() => parseEncryptionKey('')).toThrow();
  });
});

describe('encrypt()', () => {
  it('returns enc and iv as non-empty base64 strings', () => {
    const result = encrypt('hello', VALID_KEY);
    expect(result.enc).toBeTruthy();
    expect(result.iv).toBeTruthy();
  });

  it('produces a different IV on each call (random IV)', () => {
    const first = encrypt('hello', VALID_KEY);
    const second = encrypt('hello', VALID_KEY);
    expect(first.iv).not.toBe(second.iv);
  });

  it('produces different ciphertext on each call due to random IV', () => {
    const first = encrypt('hello', VALID_KEY);
    const second = encrypt('hello', VALID_KEY);
    expect(first.enc).not.toBe(second.enc);
  });
});

describe('decrypt()', () => {
  it('round-trips plain ASCII', () => {
    const { enc, iv } = encrypt('hello world', VALID_KEY);
    expect(decrypt(enc, iv, VALID_KEY)).toBe('hello world');
  });

  it('round-trips an empty string', () => {
    const { enc, iv } = encrypt('', VALID_KEY);
    expect(decrypt(enc, iv, VALID_KEY)).toBe('');
  });

  it('round-trips unicode text', () => {
    const plaintext = 'zł 100.00 — Wrocław';
    const { enc, iv } = encrypt(plaintext, VALID_KEY);
    expect(decrypt(enc, iv, VALID_KEY)).toBe(plaintext);
  });

  it('round-trips a long string', () => {
    const plaintext = 'x'.repeat(10_000);
    const { enc, iv } = encrypt(plaintext, VALID_KEY);
    expect(decrypt(enc, iv, VALID_KEY)).toBe(plaintext);
  });

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const { enc, iv } = encrypt('secret', VALID_KEY);
    const tamperedEnc = Buffer.from(enc, 'base64');
    tamperedEnc.writeUInt8(tamperedEnc.readUInt8(0) ^ 0xff, 0);
    expect(() => decrypt(tamperedEnc.toString('base64'), iv, VALID_KEY)).toThrow();
  });

  it('throws on tampered IV', () => {
    const { enc, iv } = encrypt('secret', VALID_KEY);
    const tamperedIv = Buffer.from(iv, 'base64');
    tamperedIv.writeUInt8(tamperedIv.readUInt8(0) ^ 0xff, 0);
    expect(() => decrypt(enc, tamperedIv.toString('base64'), VALID_KEY)).toThrow();
  });

  it('throws on wrong decryption key', () => {
    const { enc, iv } = encrypt('secret', VALID_KEY);
    const wrongKey = 'b'.repeat(64);
    expect(() => decrypt(enc, iv, wrongKey)).toThrow();
  });
});
