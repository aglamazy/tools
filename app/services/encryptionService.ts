/**
 * Encryption Service
 * Client-side encryption using Web Crypto API
 * - PBKDF2 for key derivation from password
 * - AES-256-GCM for encryption
 */

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16
const IV_LENGTH = 12
const KEY_LENGTH = 256

/**
 * Convert Uint8Array to base64 string (handles large arrays)
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Derive encryption key from password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt data with password
 * Returns base64 encoded string: salt (16 bytes) + iv (12 bytes) + ciphertext
 */
export async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const key = await deriveKey(password, salt)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  )

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)

  // Convert to base64
  return uint8ArrayToBase64(combined)
}

/**
 * Decrypt data with password
 * Expects base64 encoded string: salt (16 bytes) + iv (12 bytes) + ciphertext
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  const decoder = new TextDecoder()

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))

  // Extract salt, iv, and ciphertext
  const salt = combined.slice(0, SALT_LENGTH)
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH)

  const key = await deriveKey(password, salt)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  return decoder.decode(plaintext)
}

/**
 * Verify if a password can decrypt the data
 * Returns true if password is correct
 */
export async function verifyPassword(encryptedData: string, password: string): Promise<boolean> {
  try {
    await decrypt(encryptedData, password)
    return true
  } catch {
    return false
  }
}

/**
 * Generate a verification token that can be used to verify password
 * This is a small encrypted payload that can be decrypted to verify the password is correct
 */
export async function generateVerificationToken(password: string): Promise<string> {
  const verificationPayload = JSON.stringify({
    type: 'finance-backup-verification',
    created: new Date().toISOString(),
  })
  return encrypt(verificationPayload, password)
}

/**
 * Verify password using verification token
 */
export async function verifyPasswordWithToken(token: string, password: string): Promise<boolean> {
  try {
    const payload = await decrypt(token, password)
    const data = JSON.parse(payload)
    return data.type === 'finance-backup-verification'
  } catch {
    return false
  }
}
