/**
 * Backup size limit by tier (aglamazo#458).
 *
 * Mirrors storage.rules sizeAllowed(): tier 'owner' is not held to a size
 * limit; every other tier (free, home, pro, or no tier claim) keeps the
 * 2.5 MB = 2621440 bytes limit. The tier is the Firebase ID token custom
 * claim `tier` of the uploader.
 */

export const FREE_BACKUP_LIMIT_BYTES = 2621440 // 2.5 MB

export function maxBackupBytes(tier: string | undefined): number {
  return tier === 'owner' ? Infinity : FREE_BACKUP_LIMIT_BYTES
}

/**
 * The number of bytes uploadString sends for s (UTF-8), which is what the
 * Storage rule measures — not s.length, which counts UTF-16 code units
 * (aglamazo#453).
 */
export function encodedByteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

/** Read the uploader's tier claim from an auth user (undefined if none or on error). */
export async function getTierFromUser(
  user: { getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }> } | null | undefined,
): Promise<string | undefined> {
  if (!user) return undefined
  try {
    const { claims } = await user.getIdTokenResult()
    return typeof claims.tier === 'string' ? claims.tier : undefined
  } catch (error) {
    console.error('[BackupSizeLimit] Error reading tier claim:', error)
    return undefined
  }
}

/**
 * Returns the Hebrew over-limit message when sizeBytes exceeds the tier's
 * limit, or null when the size is allowed.
 */
export function backupSizeError(sizeBytes: number, tier: string | undefined): string | null {
  if (sizeBytes <= maxBackupBytes(tier)) return null
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2)
  return `הגיבוי גדול מדי (${sizeMB} MB). המגבלה בתוכנית הנוכחית היא 2.5 MB.`
}
