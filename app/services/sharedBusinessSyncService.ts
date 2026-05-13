/**
 * Shared Business Sync Service
 * Handles syncing a single business and all its children with an external user.
 *
 * Uses the same backup-and-merge pattern as cloudBackupService.ts,
 * but scoped to a single business's data tree.
 *
 * Storage path: backups/shared/{businessSyncId}/backup.enc
 */

import {
  ref,
  uploadString,
  getBytes,
  getMetadata,
} from 'firebase/storage'
import { getFirebaseStorage, isFirebaseConfigured } from '@/app/lib/firebase'
import { getFirebaseAuth } from '@/app/lib/firebase'
import { getCurrentUser } from './firebaseAuthService'
import { encrypt, decrypt, generateVerificationToken, verifyPasswordWithToken } from './encryptionService'
import { db } from '@/app/db/financeDB'
import type { BackupData } from './backupService'
import { applyCloudBackup } from './applyMergedBackupService'

const BACKUP_FILE_NAME = 'backup.enc'
const VERIFICATION_FILE_NAME = 'verify.enc'
const MAX_BACKUP_SIZE_BYTES = 2.5 * 1024 * 1024

type SyncResult = {
  success: boolean
  error?: string
  errorCode?: string
}

/**
 * Get sharedBusinesses array from current user's ID token claims
 */
export async function getSharedBusinessIdsFromToken(): Promise<string[]> {
  if (!isFirebaseConfigured()) return []

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) return []

  try {
    const tokenResult = await user.getIdTokenResult()
    const shared = tokenResult.claims.sharedBusinesses
    return Array.isArray(shared) ? shared : []
  } catch (error) {
    console.error('[SharedSync] Error getting sharedBusinesses from token:', error)
    return []
  }
}

/**
 * Read the locally-tombstoned business syncIds from the deletion ledger.
 * The ledger structure is `{ businesses: [syncId, ...], ... }` per
 * applyMergedBackupService.ts persistence shape.
 */
async function getLocallyDeletedBusinessSyncIds(): Promise<Set<string>> {
  const entry = await db.appSettings.where('key').equals('deletedRecords').first()
  const value = entry?.value as Record<string, string[]> | undefined
  const list = value?.businesses
  return new Set(Array.isArray(list) ? list : [])
}

/**
 * Export a single business and all its children as a mini BackupData.
 */
async function exportBusinessData(businessSyncId: string): Promise<BackupData | null> {
  // Find the business
  const business = await db.businesses.where('syncId').equals(businessSyncId).first()
  if (!business) {
    // If the business was locally deleted+tombstoned, the share-claim entry is
    // stale (claim is server-side and outlives local deletion). Skip silently —
    // caller's contract treats `null` as "nothing to upload, sync OK".
    const deleted = await getLocallyDeletedBusinessSyncIds()
    if (!deleted.has(businessSyncId)) {
      console.warn(`[SharedSync] Business with syncId ${businessSyncId} not found locally`)
    }
    return null
  }

  const businessId = business.id!

  // Collect child records by businessId
  const [projects, taxDocuments, advancePayments, businessTasks] = await Promise.all([
    db.projects.where('businessId').equals(businessId).toArray(),
    db.taxDocuments.where('businessId').equals(businessId).toArray(),
    db.advancePayments.where('businessId').equals(businessId).toArray(),
    db.businessTasks.where('businessId').equals(businessId).toArray(),
  ])

  // Collect harvestTasks via projectIds
  const projectIds = projects.map(p => p.id!).filter(Boolean)
  const harvestTasks = projectIds.length > 0
    ? await db.harvestTasks.where('projectId').anyOf(projectIds).toArray()
    : []

  // Collect timeEntries via harvestTask IDs
  const taskIds = harvestTasks.map(t => t.id!).filter(Boolean)
  const timeEntries = taskIds.length > 0
    ? await db.timeEntries.where('taskId').anyOf(taskIds).toArray()
    : []

  // Collect businessCategories by business name
  const bizCategory = await db.businessCategories
    .where('business').equals(business.name).first()
  const businessCategories = bizCategory ? [bizCategory] : []

  // Collect categories used by this business
  const categoryName = bizCategory?.category
  const categories = categoryName
    ? await db.categories.where('name').equals(categoryName).toArray()
    : []

  // Build mini backup — only include tables with data for this business
  const stores: any = {
    businesses: [business],
    categories,
    appSettings: [],
    businessCategories,
    importedFiles: [],
    transactions: [],
    tasks: [],
    financialInstitutions: [],
    capitalEntries: [],
    ypayDocuments: [],
    projects,
    harvestTasks,
    timeEntries,
    taxDocuments,
    advancePayments,
    businessTasks,
    subjectStore: null,
    timerStore: null,
  }

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    stores,
  }
}

/**
 * Detect new items in incoming backup by comparing syncIds with local DB.
 */
async function detectNewItems(cloud: BackupData): Promise<{ businessTasks: number; harvestTasks: number }> {
  const counts = { businessTasks: 0, harvestTasks: 0 }

  const incomingBizTasks = cloud.stores.businessTasks || []
  if (incomingBizTasks.length > 0) {
    const existing = new Set((await db.businessTasks.toArray()).map(t => t.syncId).filter(Boolean))
    counts.businessTasks = incomingBizTasks.filter((t: any) => t.syncId && !existing.has(t.syncId)).length
  }

  const incomingHarvestTasks = cloud.stores.harvestTasks || []
  if (incomingHarvestTasks.length > 0) {
    const existing = new Set((await db.harvestTasks.toArray()).map(t => t.syncId).filter(Boolean))
    counts.harvestTasks = incomingHarvestTasks.filter((t: any) => t.syncId && !existing.has(t.syncId)).length
  }

  return counts
}

/**
 * Apply shared business backup to local DB.
 * Wraps applyCloudBackup but marks the business as sharedWithMe for recipients.
 * Detects new items and emits notification events.
 */
async function applySharedBackup(
  cloud: BackupData,
  businessSyncId: string,
  isOwner: boolean,
): Promise<void> {
  // Mark business correctly based on role
  if (cloud.stores.businesses?.length > 0) {
    for (const biz of cloud.stores.businesses) {
      if (isOwner) {
        // Owner must never get sharedWithMe (sharee's upload may have it)
        delete biz.sharedWithMe
      } else {
        biz.sharedWithMe = true
      }
    }
  }

  // Detect new items before applying
  const businessName = cloud.stores.businesses?.[0]?.name || ''
  const newCounts = await detectNewItems(cloud)

  // Use the existing merge logic — it handles syncId matching, dedup, FK resolution
  await applyCloudBackup(cloud)

  // Refresh any open business UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('shared-data-updated'))
  }

  // Notify about new items
  const totalNew = newCounts.businessTasks + newCounts.harvestTasks
  if (totalNew > 0 && typeof window !== 'undefined') {
    const localBiz = await db.businesses.where('syncId').equals(businessSyncId).first()
    // Pick the right tab based on what's new
    const tab = newCounts.businessTasks > 0 && newCounts.harvestTasks === 0
      ? 'tasks' : newCounts.harvestTasks > 0 && newCounts.businessTasks === 0
      ? 'projects' : undefined
    window.dispatchEvent(new CustomEvent('shared-business-new-tasks', {
      detail: {
        count: totalNew,
        businessName,
        businessId: localBiz?.id,
        tab,
      },
    }))
  }
}

/**
 * Get the storage path for a shared business backup
 */
function getSharedBackupPath(businessSyncId: string, fileName: string): string {
  return `backups/shared/${businessSyncId}/${fileName}`
}

/**
 * Setup encryption password for a shared business backup
 */
export async function setupSharedPassword(
  businessSyncId: string,
  password: string,
): Promise<SyncResult> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) {
    return { success: false, error: 'לא מחובר', errorCode: 'not-authenticated' }
  }

  try {
    const storage = getFirebaseStorage()
    const verifyPath = getSharedBackupPath(businessSyncId, VERIFICATION_FILE_NAME)
    const verifyRef = ref(storage, verifyPath)
    const verificationToken = await generateVerificationToken(password)
    await uploadString(verifyRef, verificationToken)
    return { success: true }
  } catch (err: any) {
    console.error('[SharedSync] Setup password failed:', err)
    return { success: false, error: 'שגיאה בהגדרת סיסמת הצפנה', errorCode: 'unknown' }
  }
}

/**
 * Verify the shared business encryption password
 */
export async function verifySharedPassword(
  businessSyncId: string,
  password: string,
): Promise<boolean> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) return false

  try {
    const storage = getFirebaseStorage()
    const verifyPath = getSharedBackupPath(businessSyncId, VERIFICATION_FILE_NAME)
    const verifyRef = ref(storage, verifyPath)
    const bytes = await getBytes(verifyRef)
    const token = new TextDecoder().decode(bytes)
    return await verifyPasswordWithToken(password, token)
  } catch {
    return false
  }
}

/**
 * Get or prompt for shared business password.
 * Returns the password stored in appSettings, or null if not set.
 */
export async function getSharedPassword(businessSyncId: string): Promise<string | null> {
  const key = `sharedPassword_${businessSyncId}`
  const row = await db.appSettings.where('key').equals(key).first()
  return row?.value ?? null
}

/**
 * Save shared business password to appSettings
 */
export async function saveSharedPassword(businessSyncId: string, password: string): Promise<void> {
  const key = `sharedPassword_${businessSyncId}`
  const existing = await db.appSettings.where('key').equals(key).first()
  if (existing) {
    await db.appSettings.update(existing.id!, { value: password, updatedAt: new Date().toISOString() })
  } else {
    await db.appSettings.add({ key, value: password, updatedAt: new Date().toISOString() })
  }
}

/**
 * Download shared backup with generation metadata
 */
async function downloadSharedBackup(
  businessSyncId: string,
  password: string,
): Promise<{
  success: boolean
  data?: BackupData
  generation?: string
  error?: string
  errorCode?: string
}> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) {
    return { success: false, error: 'לא מחובר', errorCode: 'not-authenticated' }
  }

  try {
    const storage = getFirebaseStorage()
    const backupPath = getSharedBackupPath(businessSyncId, BACKUP_FILE_NAME)
    const backupRef = ref(storage, backupPath)

    let metadata
    try {
      metadata = await getMetadata(backupRef)
    } catch (err: any) {
      if (err.code === 'storage/object-not-found') {
        return { success: false, errorCode: 'no-backup' }
      }
      throw err
    }

    const bytes = await getBytes(backupRef)
    const encryptedBackup = new TextDecoder().decode(bytes)

    let backupJson: string
    try {
      backupJson = await decrypt(encryptedBackup, password)
    } catch {
      return { success: false, error: 'סיסמת הצפנה שגויה', errorCode: 'wrong-password' }
    }

    const backup = JSON.parse(backupJson) as BackupData
    return { success: true, data: backup, generation: metadata.generation }
  } catch (err: any) {
    console.error('[SharedSync] Download failed:', err)
    return { success: false, error: 'שגיאה בהורדת הגיבוי המשותף', errorCode: 'unknown' }
  }
}

/**
 * Upload shared backup with generation check
 */
async function uploadSharedBackup(
  businessSyncId: string,
  backup: BackupData,
  password: string,
  expectedGeneration?: string,
): Promise<SyncResult & { generation?: string }> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) {
    return { success: false, error: 'לא מחובר', errorCode: 'not-authenticated' }
  }

  try {
    const storage = getFirebaseStorage()
    const backupPath = getSharedBackupPath(businessSyncId, BACKUP_FILE_NAME)
    const backupRef = ref(storage, backupPath)

    if (expectedGeneration) {
      try {
        const currentMetadata = await getMetadata(backupRef)
        if (currentMetadata.generation !== expectedGeneration) {
          return { success: false, error: 'גרסה השתנתה', errorCode: 'generation-mismatch' }
        }
      } catch (err: any) {
        if (err.code !== 'storage/object-not-found') throw err
      }
    }

    const backupJson = JSON.stringify(backup)
    if (backupJson.length > MAX_BACKUP_SIZE_BYTES) {
      const sizeMB = (backupJson.length / 1024 / 1024).toFixed(2)
      return { success: false, error: `הגיבוי גדול מדי (${sizeMB} MB)`, errorCode: 'size-limit' }
    }

    const encryptedBackup = await encrypt(backupJson, password)
    await uploadString(backupRef, encryptedBackup)

    const newMetadata = await getMetadata(backupRef)
    return { success: true, generation: newMetadata.generation }
  } catch (err: any) {
    console.error('[SharedSync] Upload failed:', err)
    return { success: false, error: 'שגיאה בהעלאת הגיבוי המשותף', errorCode: 'unknown' }
  }
}

/**
 * Check if current user is the owner of a shared business
 */
async function isBusinessOwner(businessSyncId: string): Promise<boolean> {
  const business = await db.businesses.where('syncId').equals(businessSyncId).first()
  if (!business) return false
  // If business exists locally and is NOT marked as sharedWithMe, user is the owner
  return !business.sharedWithMe
}

/**
 * Sync-merge for a single shared business.
 * Same 3-step pattern: download → apply → export → upload.
 */
export async function syncSharedBusiness(
  businessSyncId: string,
  password: string,
): Promise<SyncResult> {
  const user = getCurrentUser()
  if (!user || !isFirebaseConfigured()) {
    return { success: false, error: 'לא מחובר', errorCode: 'not-authenticated' }
  }

  const isOwner = await isBusinessOwner(businessSyncId)

  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // 1. Download shared backup (with generation)
      const cloudResult = await downloadSharedBackup(businessSyncId, password)
      let generation: string | undefined

      if (cloudResult.success && cloudResult.data) {
        generation = cloudResult.generation
        await applySharedBackup(cloudResult.data, businessSyncId, isOwner)
      } else if (cloudResult.errorCode === 'no-backup') {
        // No shared backup yet — owner creates the first one
        if (!isOwner) {
          return { success: true } // Recipient: nothing to sync yet
        }
      } else {
        return { success: false, error: cloudResult.error, errorCode: cloudResult.errorCode }
      }

      // 2. Export scoped business data and upload
      const localBackup = await exportBusinessData(businessSyncId)
      if (!localBackup) {
        // Business doesn't exist locally (maybe deleted)
        return { success: true }
      }

      const uploadResult = await uploadSharedBackup(
        businessSyncId,
        localBackup,
        password,
        generation,
      )

      if (!uploadResult.success) {
        if (uploadResult.errorCode === 'generation-mismatch') {
          continue // Retry
        }
        return uploadResult
      }

      console.log(`[SharedSync] Successfully synced business ${businessSyncId}`)
      return { success: true }
    } catch (err: any) {
      console.error(`[SharedSync] Attempt ${attempt + 1} failed:`, err)
      if (attempt === MAX_RETRIES - 1) {
        return { success: false, error: 'שגיאה בסנכרון עסק משותף', errorCode: 'unknown' }
      }
    }
  }

  return { success: false, error: 'נכשל אחרי מספר ניסיונות', errorCode: 'unknown' }
}

/**
 * Sync all shared businesses for the current user.
 * Called after the main personal/household sync completes.
 */
export async function syncAllSharedBusinesses(getPassword: (bizSyncId: string) => Promise<string | null>): Promise<void> {
  const sharedIds = await getSharedBusinessIdsFromToken()
  if (sharedIds.length === 0) return

  // Filter out share-claim entries for businesses the user has already deleted
  // locally — no point spinning up Firebase Storage round-trips + password
  // prompts for businesses that are tombstoned.
  const deleted = await getLocallyDeletedBusinessSyncIds()
  const liveIds = sharedIds.filter(id => !deleted.has(id))

  for (const bizSyncId of liveIds) {
    const password = await getPassword(bizSyncId)
    if (!password) {
      console.warn(`[SharedSync] No password for shared business ${bizSyncId}, skipping`)
      continue
    }

    const result = await syncSharedBusiness(bizSyncId, password)
    if (!result.success) {
      console.error(`[SharedSync] Failed to sync ${bizSyncId}:`, result.error)
    }
  }
}
