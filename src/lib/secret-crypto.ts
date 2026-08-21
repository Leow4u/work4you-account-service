/**
 * AES-256-GCM helpers for recoverable Portal API key secrets (copy-on-return).
 * Auth still uses SHA-256 hash; ciphertext is only for owner reveal/copy.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function encryptionKey(): Buffer {
  const raw =
    process.env.API_KEY_ENCRYPTION_SECRET?.trim() ||
    process.env.JWT_PRIVATE_KEY_B64?.trim() ||
    process.env.INFERENCE_BILLING_SECRET?.trim() ||
    ''
  if (!raw) {
    throw new Error('API_KEY_ENCRYPTION_SECRET is not set')
  }
  return createHash('sha256').update(raw).digest()
}

/** Returns base64url(iv || tag || ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64url')
  if (buf.length < 28) throw new Error('invalid_ciphertext')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
