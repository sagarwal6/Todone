/**
 * Encryption Utilities
 *
 * Provides encryption/decryption for sensitive data like OAuth tokens.
 * Uses Web Crypto API for secure encryption.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/**
 * Derive an encryption key from a password/secret
 */
async function deriveKey(
  secret: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string value
 * Returns base64-encoded ciphertext with salt and IV prepended
 */
export async function encrypt(
  plaintext: string,
  secret?: string
): Promise<string> {
  const encryptionSecret = secret || process.env.ENCRYPTION_SECRET;
  if (!encryptionSecret) {
    throw new Error('ENCRYPTION_SECRET not configured');
  }

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key
  const key = await deriveKey(encryptionSecret, salt);

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    plaintextBytes
  );

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(
    SALT_LENGTH + IV_LENGTH + ciphertext.byteLength
  );
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

  // Encode to base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a string value
 * Expects base64-encoded ciphertext with salt and IV prepended
 */
export async function decrypt(
  ciphertext: string,
  secret?: string
): Promise<string> {
  const encryptionSecret = secret || process.env.ENCRYPTION_SECRET;
  if (!encryptionSecret) {
    throw new Error('ENCRYPTION_SECRET not configured');
  }

  // Decode from base64
  const combined = new Uint8Array(
    atob(ciphertext)
      .split('')
      .map((c) => c.charCodeAt(0))
  );

  // Extract salt, iv, and ciphertext
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const encryptedData = combined.slice(SALT_LENGTH + IV_LENGTH);

  // Derive key
  const key = await deriveKey(encryptionSecret, salt);

  // Decrypt
  const plaintextBytes = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encryptedData
  );

  // Decode to string
  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
}

/**
 * Hash a value (one-way)
 */
export async function hash(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Generate a random token
 */
export function generateToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
