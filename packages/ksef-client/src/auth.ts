import crypto from 'node:crypto';

/**
 * Encrypts the KSeF token for Path B (token-based) authentication.
 *
 * Plaintext format: `{ksefToken}|{challengeTimestampMs}`
 * Algorithm: RSA-OAEP with SHA-256 for both OAEP hash and MGF1
 * Key: KsefTokenEncryption certificate from /security/public-key-certificates
 *
 * The plaintext must fit within the RSA key's capacity. For a 2048-bit key
 * with OAEP SHA-256, the limit is 190 bytes. The token alone must be ≤176 bytes.
 * If the stored token is too long (e.g. a JWT was saved instead of the API token),
 * Node will throw ERR_OSSL_RSA_DATA_TOO_LARGE_FOR_KEY_SIZE.
 *
 * Returns Base64-encoded ciphertext.
 */
export const encryptKsefToken = (
  ksefToken: string,
  challengeTimestampMs: number,
  tokenEncryptionCertBase64: string
): string => {
  const certDer = Buffer.from(tokenEncryptionCertBase64, 'base64');
  const cert = new crypto.X509Certificate(certDer);

  const plaintext = `${ksefToken}|${challengeTimestampMs}`;
  const plaintextBytes = Buffer.byteLength(plaintext, 'utf8');
  const keyBytes = cert.publicKey.asymmetricKeyDetails?.modulusLength
    ? cert.publicKey.asymmetricKeyDetails.modulusLength / 8
    : 256;
  const maxBytes = keyBytes - 2 * 32 - 2; // OAEP SHA-256 overhead

  if (plaintextBytes > maxBytes) {
    throw new Error(
      `KSeF token is too long to encrypt (${plaintextBytes} bytes, max ${maxBytes} for this key). ` +
      `Ensure the stored token is the short API token from the KSeF portal, not a JWT session token.`
    );
  }

  const encrypted = crypto.publicEncrypt(
    {
      key: cert.publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(plaintext, 'utf8')
  );

  return encrypted.toString('base64');
};

/**
 * Generates a random 256-bit AES key and 128-bit IV for invoice encryption.
 */
export const generateAesSessionKey = (): { key: Buffer; iv: Buffer } => ({
  key: crypto.randomBytes(32),
  iv: crypto.randomBytes(16)
});

/**
 * Encrypts the AES session key using the KSeF SymmetricKeyEncryption RSA certificate.
 * RSA-OAEP with SHA-256.
 *
 * Returns Base64-encoded encrypted key.
 */
export const encryptAesKey = (aesKey: Buffer, symmetricKeyEncCertBase64: string): string => {
  const certDer = Buffer.from(symmetricKeyEncCertBase64, 'base64');
  const cert = new crypto.X509Certificate(certDer);

  const encrypted = crypto.publicEncrypt(
    {
      key: cert.publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    aesKey
  );

  return encrypted.toString('base64');
};

/**
 * Encrypts invoice XML with AES-256-CBC.
 * Returns the encrypted bytes.
 */
export const encryptInvoiceXml = (xml: string, aesKey: Buffer, iv: Buffer): Buffer => {
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  return Buffer.concat([cipher.update(xml, 'utf8'), cipher.final()]);
};
