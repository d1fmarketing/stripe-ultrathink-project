import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';
const DEFAULT_SENSITIVE_FIELDS = [
  'access_token',
  'refresh_token',
  'webhook_secret',
  'stripe_publishable_key',
  'merchant_access_token'
] as const;

type SensitiveField = (typeof DEFAULT_SENSITIVE_FIELDS)[number] | string;

function getKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required for sensitive data encryption');
  }

  const base64Buffer = Buffer.from(rawKey, 'base64');
  if (base64Buffer.length === 32) {
    return base64Buffer;
  }

  const hexBuffer = Buffer.from(rawKey, 'hex');
  if (hexBuffer.length === 32) {
    return hexBuffer;
  }

  const utf8Buffer = Buffer.from(rawKey, 'utf8');
  if (utf8Buffer.length === 32) {
    return utf8Buffer;
  }

  throw new Error('ENCRYPTION_KEY must decode to 32 bytes for AES-256-GCM');
}

function encryptBuffer(value: string): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

function decryptBuffer(iv: Buffer, authTag: Buffer, ciphertext: Buffer): Buffer {
  const key = getKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function isEncryptedValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

export function encryptString(value: string): string {
  if (isEncryptedValue(value)) {
    return value;
  }

  const { ciphertext, iv, authTag } = encryptBuffer(value);
  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return `${ENCRYPTION_PREFIX}${payload.toString('base64')}`;
}

export function decryptString(value: string): string {
  if (!isEncryptedValue(value)) {
    return value;
  }

  const payload = Buffer.from(value.substring(ENCRYPTION_PREFIX.length), 'base64');
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);

  const decrypted = decryptBuffer(iv, authTag, ciphertext);
  return decrypted.toString('utf8');
}

export function encryptSensitiveRecord<T extends Record<string, any>>(record: T, fields: ReadonlyArray<SensitiveField> = DEFAULT_SENSITIVE_FIELDS): T {
  const result: Record<string, any> = { ...record };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      result[field] = encryptString(result[field]);
    }
  }
  return result as T;
}

export function decryptSensitiveRecord<T extends Record<string, any>>(record: T, fields: ReadonlyArray<SensitiveField> = DEFAULT_SENSITIVE_FIELDS): T {
  const result: Record<string, any> = { ...record };
  for (const field of fields) {
    if (typeof result[field] === 'string' && isEncryptedValue(result[field])) {
      result[field] = decryptString(result[field]);
    }
  }
  return result as T;
}
