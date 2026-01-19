/**
 * Cloud Backup Service
 * Handles encrypted backup storage in Firebase Storage
 */

import {
  ref,
  uploadString,
  getDownloadURL,
  getMetadata,
  deleteObject,
} from 'firebase/storage'
import { getFirebaseStorage, isFirebaseConfigured } from '@/app/lib/firebase'
import { getCurrentUser } from './firebaseAuthService'
import { encrypt, decrypt, generateVerificationToken, verifyPasswordWithToken } from './encryptionService'
import { exportAllStores, importAllStores, type BackupData } from './backupService'

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
}

/**
 * Get the storage path for user's backup
 */
function getBackupPath(uid: string, fileName: string): string {
  return `backups/${uid}/${fileName}`
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
    const verifyRef = ref(storage, getBackupPath(user.uid, VERIFICATION_FILE_NAME))

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
    const verifyRef = ref(storage, getBackupPath(user.uid, VERIFICATION_FILE_NAME))

    const url = await getDownloadURL(verifyRef)
    const response = await fetch(url)
    const verificationToken = await response.text()

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
    const verifyRef = ref(storage, getBackupPath(user.uid, VERIFICATION_FILE_NAME))
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
    const backupRef = ref(storage, getBackupPath(user.uid, BACKUP_FILE_NAME))
    await uploadString(backupRef, encryptedBackup)

    console.log('[CloudBackup] Backup uploaded successfully')
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
    const backupRef = ref(storage, getBackupPath(user.uid, BACKUP_FILE_NAME))

    // Download encrypted backup
    const url = await getDownloadURL(backupRef)
    const response = await fetch(url)
    const encryptedBackup = await response.text()

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
    const backupRef = ref(storage, getBackupPath(user.uid, BACKUP_FILE_NAME))
    const metadata = await getMetadata(backupRef)

    return {
      exists: true,
      sizeBytes: metadata.size,
      lastModified: metadata.updated,
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
 */
export async function deleteBackup(): Promise<CloudBackupResult> {
  const user = getCurrentUser()
  if (!user) {
    return { success: false, error: 'יש להתחבר', errorCode: 'not-authenticated' }
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase לא מוגדר', errorCode: 'not-configured' }
  }

  try {
    const storage = getFirebaseStorage()

    // Delete backup file
    const backupRef = ref(storage, getBackupPath(user.uid, BACKUP_FILE_NAME))
    try {
      await deleteObject(backupRef)
    } catch (err: any) {
      if (err.code !== 'storage/object-not-found') throw err
    }

    // Delete verification file
    const verifyRef = ref(storage, getBackupPath(user.uid, VERIFICATION_FILE_NAME))
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
