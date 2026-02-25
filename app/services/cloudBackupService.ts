/**
 * Cloud Backup Service
 * Handles encrypted backup storage in Firebase Storage
 *
 * Supports two storage modes:
 * 1. Personal: backups/{userId}/... (default for FREE/PRO users)
 * 2. Household: backups/households/{householdId}/... (for HOME tier sharing)
 */

import {
  ref,
  uploadString,
  getBytes,
  getMetadata,
  deleteObject,
} from 'firebase/storage'
import { getFirebaseStorage, isFirebaseConfigured } from '@/app/lib/firebase'
import { getFirebaseAuth } from '@/app/lib/firebase'
import { getCurrentUser } from './firebaseAuthService'
import { encrypt, decrypt, generateVerificationToken, verifyPasswordWithToken } from './encryptionService'
import { exportAllStores, importAllStores, isLocalDataEmpty, type BackupData } from './backupService'
import { mergeBackups } from './mergeService'
import { applyMergedBackup } from './applyMergedBackupService'
import { purgeOldDeletedRecords } from './purgeService'

const BACKUP_FILE_NAME = 'backup.enc'
const VERIFICATION_FILE_NAME = 'verify.enc'
const MAX_BACKUP_SIZE_BYTES = 2.5 * 1024 * 1024 // 2.5 MB

export type CloudBackupResult = {
  success: boolean
  error?: string
  errorCode?: 'not-authenticated' | 'not-configured' | 'size-limit' | 'wrong-password' | 'no-backup' | 'unknown'
}

export type CloudBackupInfo = {
  exists: boolean
  sizeBytes?: number
  lastModified?: string
  error?: string
  isHousehold?: boolean
}

/**
 * Get householdId from current user's ID token claims
 * Returns null if not in a household
 */
async function getHouseholdIdFromToken(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) return null

  try {
    const tokenResult = await user.getIdTokenResult()
    return (tokenResult.claims.householdId as string) || null
  } catch (error) {
    console.error('[CloudBackup] Error getting householdId from token:', error)
    return null
  }
}

/**
 * Get the storage path for backup files
 * Uses household path if user is in a household, otherwise personal path
 */
async function getBackupPath(uid: string, fileName: string): Promise<string> {
  const householdId = await getHouseholdIdFromToken()

  if (householdId) {
    console.log('[CloudBackup] Using household path:', householdId)
    return `backups/households/${householdId}/${fileName}`
  }

  return `backups/${uid}/${fileName}`
}

/**
 * Check if user is currently using household storage
 */
export async function isUsingHouseholdStorage(): Promise<boolean> {
  const householdId = await getHouseholdIdFromToken()
  return householdId !== null
}

/**
 * Migrate personal backup to household storage
 * Called after creating a household — copies backup.enc and verify.enc
 * from personal path to the shared household path
 */
export async function migrateToHouseholdStorage(): Promise<CloudBackupResult> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) {
    return { success: false, error: 'לא מחובר', errorCode: 'not-authenticated' }
  }

  const householdId = await getHouseholdIdFromToken()
  if (!householdId) {
    return { success: false, error: 'לא חבר במשק בית', errorCode: 'not-configured' }
  }

  const storage = getFirebaseStorage()
  const filesToMigrate = [BACKUP_FILE_NAME, VERIFICATION_FILE_NAME]
  let migrated = 0

  for (const fileName of filesToMigrate) {
    const personalPath = `backups/${user.uid}/${fileName}`
    const householdPath = `backups/households/${householdId}/${fileName}`

    try {
      const personalRef = ref(storage, personalPath)
      const bytes = await getBytes(personalRef)
      const content = new TextDecoder().decode(bytes)

      const householdRef = ref(storage, householdPath)
      await uploadString(householdRef, content)
      migrated++

      console.log(`[CloudBackup] Migrated ${fileName} to household path`)
    } catch (err: any) {
      if (err.code === 'storage/object-not-found') {
        console.log(`[CloudBackup] No personal ${fileName} to migrate`)
      } else {
        console.error(`[CloudBackup] Failed to migrate ${fileName}:`, err)
        return { success: false, error: 'שגיאה בהעברת הגיבוי למשק הבית', errorCode: 'unknown' }
      }
    }
  }

  if (migrated === 0) {
    return { success: true } // Nothing to migrate, not an error
  }

  console.log(`[CloudBackup] Migration complete: ${migrated} files moved to household`)
  return { success: true }
}

/**
 * Check if cloud backup is available (Firebase configured + user authenticated)
 */
export function isCloudBackupAvailable(): boolean {
  return isFirebaseConfigured() && getCurrentUser() !== null
}

/**
 * Setup encryption password for first-time cloud backup
 * Creates a verification token to verify password on future decryptions
 */
export async function setupEncryptionPassword(password: string): Promise<CloudBackupResult> {
  const user = getCurrentUser()
  if (!user) {
    return { success: false, error: 'יש להתחבר כדי להשתמש בגיבוי ענן', errorCode: 'not-authenticated' }
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase לא מוגדר', errorCode: 'not-configured' }
  }

  try {
    const storage = getFirebaseStorage()
    const backupPath = await getBackupPath(user.uid, VERIFICATION_FILE_NAME)
    const verifyRef = ref(storage, backupPath)

    // Generate and upload verification token
    const verificationToken = await generateVerificationToken(password)
    await uploadString(verifyRef, verificationToken)

    return { success: true }
  } catch (err: any) {
    console.error('[CloudBackup] Setup password failed:', err)
    return { success: false, error: 'שגיאה בהגדרת סיסמת הצפנה', errorCode: 'unknown' }
  }
}

/**
 * Verify encryption password
 */
export async function verifyEncryptionPassword(password: string): Promise<boolean> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) return false

  try {
    const storage = getFirebaseStorage()
    const backupPath = await getBackupPath(user.uid, VERIFICATION_FILE_NAME)
    const verifyRef = ref(storage, backupPath)

    const bytes = await getBytes(verifyRef)
    const verificationToken = new TextDecoder().decode(bytes)

    return await verifyPasswordWithToken(verificationToken, password)
  } catch {
    return false
  }
}

/**
 * Check if user has encryption password set up
 */
export async function hasEncryptionPasswordSetup(): Promise<boolean> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) return false

  try {
    const storage = getFirebaseStorage()
    const backupPath = await getBackupPath(user.uid, VERIFICATION_FILE_NAME)
    const verifyRef = ref(storage, backupPath)
    await getMetadata(verifyRef)
    return true
  } catch {
    return false
  }
}

/**
 * Upload encrypted backup to cloud
 */
export async function uploadBackup(password: string): Promise<CloudBackupResult> {
  const user = getCurrentUser()
  if (!user) {
    return { success: false, error: 'יש להתחבר כדי להשתמש בגיבוי ענן', errorCode: 'not-authenticated' }
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase לא מוגדר', errorCode: 'not-configured' }
  }

  try {
    // SAFETY: Never upload empty data
    const localEmpty = await isLocalDataEmpty()
    if (localEmpty) {
      console.warn('[CloudBackup] Refusing to upload - local data is empty')
      return { success: false, error: 'אין נתונים מקומיים לגיבוי', errorCode: 'no-backup' }
    }

    // Verify password first
    const isValidPassword = await verifyEncryptionPassword(password)
    if (!isValidPassword) {
      return { success: false, error: 'סיסמת הצפנה שגויה', errorCode: 'wrong-password' }
    }

    // Export and encrypt backup
    const backup = await exportAllStores()
    const backupJson = JSON.stringify(backup)

    // Check size before encryption (encrypted will be slightly larger)
    if (backupJson.length > MAX_BACKUP_SIZE_BYTES) {
      const sizeMB = (backupJson.length / 1024 / 1024).toFixed(2)
      return {
        success: false,
        error: `הגיבוי גדול מדי (${sizeMB} MB). המגבלה היא 2.5 MB.`,
        errorCode: 'size-limit',
      }
    }

    const encryptedBackup = await encrypt(backupJson, password)

    // Upload to Firebase Storage
    const storage = getFirebaseStorage()
    const backupPath = await getBackupPath(user.uid, BACKUP_FILE_NAME)
    const backupRef = ref(storage, backupPath)
    await uploadString(backupRef, encryptedBackup)

    console.log('[CloudBackup] Backup uploaded successfully to:', backupPath)
    return { success: true }
  } catch (err: any) {
    console.error('[CloudBackup] Upload failed:', err)
    return { success: false, error: 'שגיאה בהעלאת הגיבוי', errorCode: 'unknown' }
  }
}

/**
 * Download and decrypt backup from cloud
 */
export async function downloadBackup(password: string): Promise<CloudBackupResult & { data?: BackupData }> {
  const user = getCurrentUser()
  if (!user) {
    return { success: false, error: 'יש להתחבר כדי להשתמש בגיבוי ענן', errorCode: 'not-authenticated' }
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase לא מוגדר', errorCode: 'not-configured' }
  }

  try {
    const storage = getFirebaseStorage()
    const backupPath = await getBackupPath(user.uid, BACKUP_FILE_NAME)
    const backupRef = ref(storage, backupPath)

    // Download encrypted backup
    const bytes = await getBytes(backupRef)
    const encryptedBackup = new TextDecoder().decode(bytes)

    // Decrypt
    let backupJson: string
    try {
      backupJson = await decrypt(encryptedBackup, password)
    } catch {
      return { success: false, error: 'סיסמת הצפנה שגויה', errorCode: 'wrong-password' }
    }

    const backup = JSON.parse(backupJson) as BackupData
    console.log('[CloudBackup] Backup downloaded successfully')

    return { success: true, data: backup }
  } catch (err: any) {
    if (err.code === 'storage/object-not-found') {
      return { success: false, error: 'לא נמצא גיבוי בענן', errorCode: 'no-backup' }
    }
    console.error('[CloudBackup] Download failed:', err)
    return { success: false, error: 'שגיאה בהורדת הגיבוי', errorCode: 'unknown' }
  }
}

/**
 * Download backup and import to local database
 */
export async function restoreFromCloud(password: string): Promise<CloudBackupResult> {
  const result = await downloadBackup(password)
  if (!result.success || !result.data) {
    return result
  }

  try {
    await importAllStores(result.data)
    console.log('[CloudBackup] Backup restored successfully')
    return { success: true }
  } catch (err: any) {
    console.error('[CloudBackup] Restore failed:', err)
    return { success: false, error: 'שגיאה בשחזור הנתונים', errorCode: 'unknown' }
  }
}

/**
 * Get backup metadata
 */
export async function getBackupInfo(): Promise<CloudBackupInfo> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) {
    return { exists: false }
  }

  try {
    const storage = getFirebaseStorage()
    const backupPath = await getBackupPath(user.uid, BACKUP_FILE_NAME)
    const backupRef = ref(storage, backupPath)
    const metadata = await getMetadata(backupRef)
    const isHousehold = backupPath.includes('/households/')

    return {
      exists: true,
      sizeBytes: metadata.size,
      lastModified: metadata.updated,
      isHousehold,
    }
  } catch (err: any) {
    if (err.code === 'storage/object-not-found') {
      return { exists: false }
    }
    return { exists: false, error: err.message }
  }
}

/**
 * Delete cloud backup
 * For household backups, only the owner can delete
 */
export async function deleteBackup(): Promise<CloudBackupResult> {
  const user = getCurrentUser()
  if (!user) {
    return { success: false, error: 'יש להתחבר', errorCode: 'not-authenticated' }
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase לא מוגדר', errorCode: 'not-configured' }
  }

  // Block non-owners from deleting household backups
  const householdId = await getHouseholdIdFromToken()
  if (householdId) {
    const auth = getFirebaseAuth()
    const tokenResult = await auth.currentUser!.getIdTokenResult()
    if (tokenResult.claims.householdRole !== 'owner') {
      return { success: false, error: 'רק בעל משק הבית יכול למחוק את הגיבוי המשותף', errorCode: 'not-authenticated' }
    }
  }

  try {
    const storage = getFirebaseStorage()

    // Delete backup file
    const backupPath = await getBackupPath(user.uid, BACKUP_FILE_NAME)
    const backupRef = ref(storage, backupPath)
    try {
      await deleteObject(backupRef)
    } catch (err: any) {
      if (err.code !== 'storage/object-not-found') throw err
    }

    // Delete verification file
    const verifyPath = await getBackupPath(user.uid, VERIFICATION_FILE_NAME)
    const verifyRef = ref(storage, verifyPath)
    try {
      await deleteObject(verifyRef)
    } catch (err: any) {
      if (err.code !== 'storage/object-not-found') throw err
    }

    return { success: true }
  } catch (err: any) {
    console.error('[CloudBackup] Delete failed:', err)
    return { success: false, error: 'שגיאה במחיקת הגיבוי', errorCode: 'unknown' }
  }
}

/**
 * Download backup with its generation metadata for optimistic locking.
 */
async function downloadBackupWithGeneration(password: string): Promise<
  { success: true; data: BackupData; generation: string } |
  { success: false; error: string; errorCode?: string }
> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) {
    return { success: false, error: 'לא מחובר', errorCode: 'not-authenticated' }
  }

  const storage = getFirebaseStorage()
  const backupPath = await getBackupPath(user.uid, BACKUP_FILE_NAME)
  const backupRef = ref(storage, backupPath)

  try {
    const [bytes, metadata] = await Promise.all([
      getBytes(backupRef),
      getMetadata(backupRef),
    ])
    const encryptedBackup = new TextDecoder().decode(bytes)

    let backupJson: string
    try {
      backupJson = await decrypt(encryptedBackup, password)
    } catch {
      return { success: false, error: 'סיסמת הצפנה שגויה', errorCode: 'wrong-password' }
    }

    const data = JSON.parse(backupJson) as BackupData
    return { success: true, data, generation: metadata.generation }
  } catch (err: any) {
    if (err.code === 'storage/object-not-found') {
      return { success: false, error: 'no-backup', errorCode: 'no-backup' }
    }
    return { success: false, error: err.message, errorCode: 'unknown' }
  }
}

/**
 * Upload backup with optimistic lock check.
 * Fails if cloud generation changed since we downloaded.
 */
async function uploadBackupWithGeneration(
  data: BackupData,
  password: string,
  expectedGeneration: string | null,
): Promise<{ success: boolean; error?: string }> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) {
    return { success: false, error: 'לא מחובר' }
  }

  const storage = getFirebaseStorage()
  const backupPath = await getBackupPath(user.uid, BACKUP_FILE_NAME)
  const backupRef = ref(storage, backupPath)

  // Optimistic lock: verify generation hasn't changed
  if (expectedGeneration) {
    try {
      const currentMeta = await getMetadata(backupRef)
      if (currentMeta.generation !== expectedGeneration) {
        return { success: false, error: 'generation-mismatch' }
      }
    } catch (err: any) {
      // File was deleted between download and upload — proceed with upload
      if (err.code !== 'storage/object-not-found') {
        return { success: false, error: err.message }
      }
    }
  }

  const backupJson = JSON.stringify(data)
  if (backupJson.length > MAX_BACKUP_SIZE_BYTES) {
    return { success: false, error: 'size-limit' }
  }

  const encrypted = await encrypt(backupJson, password)
  await uploadString(backupRef, encrypted)
  return { success: true }
}

const SYNC_MERGE_MAX_RETRIES = 3

/**
 * Merge-on-sync: download cloud backup, merge with local, upload merged result.
 * Both devices can edit freely — conflicts resolved per-record (newest wins).
 * Uses optimistic locking to prevent lost updates.
 */
export async function syncMerge(password: string): Promise<CloudBackupResult> {
  const user = getCurrentUser()
  if (!user) {
    return { success: false, error: 'יש להתחבר', errorCode: 'not-authenticated' }
  }
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase לא מוגדר', errorCode: 'not-configured' }
  }

  // SAFETY: Never sync with empty local data
  const localEmpty = await isLocalDataEmpty()
  if (localEmpty) {
    return { success: false, error: 'אין נתונים מקומיים', errorCode: 'no-backup' }
  }

  for (let attempt = 1; attempt <= SYNC_MERGE_MAX_RETRIES; attempt++) {
    console.log(`[CloudSync] syncMerge attempt ${attempt}/${SYNC_MERGE_MAX_RETRIES}`)

    // 1. Export local backup (with raw access to include soft-deleted records)
    const localBackup = await exportAllStores()

    // 2. Download cloud backup with generation
    const cloudResult = await downloadBackupWithGeneration(password)

    let merged: BackupData
    let generation: string | null = null

    if (!cloudResult.success) {
      if (cloudResult.errorCode === 'no-backup') {
        // No cloud backup yet — just upload local
        merged = localBackup
      } else {
        return { success: false, error: cloudResult.error, errorCode: cloudResult.errorCode as any }
      }
    } else {
      // 3. Merge local + cloud
      generation = cloudResult.generation
      merged = mergeBackups(localBackup, cloudResult.data)
    }

    // 4. Upload merged result with optimistic lock
    const uploadResult = await uploadBackupWithGeneration(merged, password, generation)

    if (uploadResult.success) {
      // 5. Apply the merged backup to local DB (in-place)
      await applyMergedBackup(merged)

      // 6. Purge old soft-deleted records
      await purgeOldDeletedRecords()

      console.log('[CloudSync] syncMerge completed successfully')
      return { success: true }
    }

    if (uploadResult.error === 'generation-mismatch') {
      console.log('[CloudSync] Generation mismatch — retrying...')
      continue // Re-download and re-merge
    }

    // Non-retryable error
    return { success: false, error: uploadResult.error, errorCode: 'unknown' }
  }

  return { success: false, error: 'סנכרון נכשל לאחר מספר ניסיונות', errorCode: 'unknown' }
}
