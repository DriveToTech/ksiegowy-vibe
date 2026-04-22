import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { encryptInvoiceXml, generateAesSessionKey } from './auth.js';

test('generateAesSessionKey produces 256-bit key and 128-bit IV', () => {
  const { key, iv } = generateAesSessionKey();
  assert.equal(key.length, 32); // 256 bits
  assert.equal(iv.length, 16);  // 128 bits
});

test('generateAesSessionKey produces unique values on each call', () => {
  const first = generateAesSessionKey();
  const second = generateAesSessionKey();
  assert.notEqual(first.key.toString('hex'), second.key.toString('hex'));
  assert.notEqual(first.iv.toString('hex'), second.iv.toString('hex'));
});

test('encryptInvoiceXml produces non-empty bytes different from plaintext', () => {
  const { key, iv } = generateAesSessionKey();
  const xml = '<?xml version="1.0"?><Invoice><Test>Hello</Test></Invoice>';
  const encrypted = encryptInvoiceXml(xml, key, iv);

  assert.ok(encrypted.byteLength > 0);
  assert.notEqual(encrypted.toString('utf8'), xml);
});

test('encryptInvoiceXml is reversible with same key and IV', () => {
  const { key, iv } = generateAesSessionKey();
  const xml = '<?xml version="1.0"?><Invoice>Zażółć gęślą jaźń</Invoice>';
  const encrypted = encryptInvoiceXml(xml, key, iv);

  // Decrypt to verify roundtrip
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  assert.equal(decrypted, xml);
});

test('encryptInvoiceXml produces different output with different keys', () => {
  const { key: key1, iv } = generateAesSessionKey();
  const { key: key2 } = generateAesSessionKey();
  const xml = '<?xml version="1.0"?><Invoice/>';

  const encrypted1 = encryptInvoiceXml(xml, key1, iv);
  const encrypted2 = encryptInvoiceXml(xml, key2, iv);

  assert.notEqual(encrypted1.toString('hex'), encrypted2.toString('hex'));
});
