/**
 * Symmetric AES-256-GCM encryption for store credentials (Saliko Tier 3).
 *
 * Used by the server-side branches of shufersalClient + retalixClient when a
 * logged-in user has granted Tier-3 consent (see `consentService.ts`). The
 * plaintext credential lives in the user's browser IndexedDB (Dexie) as the
 * master copy; the encrypted ciphertext written via this helper is a derived
 * server-side copy that exists ONLY to let the unattended cron path log in on
 * the user's behalf when they're not online.
 *
 * Wire format: `${ivB64}:${tagB64}:${ciphertextB64}`. All three pieces are
 * standard base64. Decoding splits on `:` (none of the components contain
 * `:` because they're base64 of binary). A bumped format prefix can be added
 * later — for v1 the colon-split shape is enough.
 *
 * Key: `SALIKO_CREDS_ENCRYPTION_KEY` env var, base64-encoded 32 bytes.
 * Generate with:  `openssl rand -base64 32`.
 *
 * TODO (KMS migration): replace the env-var key with a KMS-managed key
 * (Google Cloud KMS — same region as the Firestore project). The migration
 * is a self-contained swap of the internals of `getKey()`; the
 * `encryptCred` / `decryptCred` surface stays identical so no caller code
 * needs to change. Re-encrypting existing ciphertext can be a one-shot
 * script that runs decryptCred(env-key) → encryptCred(kms-key) per doc.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // 96-bit IV recommended for GCM
const KEY_BYTES = 32 // AES-256

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.SALIKO_CREDS_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new Error(
      'SALIKO_CREDS_ENCRYPTION_KEY not set — required for Tier-3 server-side credential storage. ' +
      'Generate one with: openssl rand -base64 32',
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SALIKO_CREDS_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). ` +
      'Regenerate with: openssl rand -base64 32',
    )
  }
  cachedKey = key
  return key
}

/** Encrypt a plaintext credential. Output: `ivB64:tagB64:ciphertextB64`. */
export function encryptCred(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new Error('encryptCred: plaintext must be a string')
  }
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

/** Decrypt a ciphertext produced by `encryptCred`. Throws on bad format or tag mismatch. */
export function decryptCred(ciphertext: string): string {
  if (typeof ciphertext !== 'string' || !ciphertext.includes(':')) {
    throw new Error('decryptCred: ciphertext must be in `iv:tag:payload` format')
  }
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error(`decryptCred: expected 3 colon-separated parts, got ${parts.length}`)
  }
  const [ivB64, tagB64, payloadB64] = parts
  const key = getKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const payload = Buffer.from(payloadB64, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(payload), decipher.final()])
  return dec.toString('utf8')
}

/**
 * Sentinel thrown when a stored credential cannot be decrypted — bad format,
 * AES tag mismatch, or (most commonly) the `SALIKO_CREDS_ENCRYPTION_KEY`
 * changed since the credential was saved. Distinct from a "credentials wrong
 * at the store" failure: corruption means the user must re-enter the
 * credential (Settings vault) or re-grant Tier 3, NOT that their password is
 * wrong. Callers (login, cron) catch this to surface the real state instead of
 * silently reporting success.
 */
export class CredsCorruptedError extends Error {
  constructor(message = 'CREDS_CORRUPTED') {
    super(message)
    this.name = 'CredsCorruptedError'
  }
}

/** True if the value looks like an `encryptCred` output. Used during the
 *  rollout window to safely read mixed plaintext / ciphertext docs. */
export function looksEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const parts = value.split(':')
  if (parts.length !== 3) return false
  // Cheap sanity check — base64 is [A-Za-z0-9+/=]+; if all three parts pass
  // we treat it as encrypted. Plaintext passwords with two colons are
  // extremely rare, so this is good enough as a pre-decrypt sniff.
  return parts.every(p => /^[A-Za-z0-9+/=]+$/.test(p) && p.length > 0)
}
