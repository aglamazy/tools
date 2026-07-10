/**
 * Shared Business Sync Service
 * Handles syncing a single business and all its children with an external user.
 *
 * Uses the same backup-and-merge pattern as cloudBackupService.ts,
 * but scoped to a single business's data tree.
 *
 * Storage path: backups/{variant}/shared/{businessSyncId}/backup.enc
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
import { subjectStore } from '@/app/stores/subjectStore'
import { classifySyncError } from './syncErrorClassifier'
import { VARIANT } from '@/app/config/variants'

/**
 * Status of a background shared-business sync, broadcast as a DOM CustomEvent so
 * the header indicator (SharedBusinessIndicators) can turn red / green without
 * the user having to manually open the modal. (#104)
 */
export type SharedSyncStatus = 'ok' | 'error' | 'no-password'
export const SHARED_SYNC_STATUS_EVENT = 'shared-business-sync-status'

export type SharedSyncStatusDetail = {
  bizSyncId: string
  status: SharedSyncStatus
  errorCode?: string
  error?: string
}

function dispatchSharedSyncStatus(detail: SharedSyncStatusDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SHARED_SYNC_STATUS_EVENT, { detail }))
}

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
 *
 * Scope — everything the business-view tabs read:
 *   - business doc + businessCategories rows + Category rows for those names
 *   - transactions tagged with any of the business's categories
 *     (powers הכנסות / הוצאות / התחשבנות tabs)
 *   - ypayDocuments linked to those transactions (חשבוניות tab)
 *   - expenseDocuments linked to those transactions (מסמכים פתוחים tab)
 *   - projects + harvestTasks + timeEntries (פרויקטים / תיעוד זמן)
 *   - businessTasks (משימות), taxDocuments + advancePayments (settings/tax)
 *
 * Out of scope (intentionally not shared):
 *   - tasks (personal Eisenhower todos)
 *   - importedFiles (raw bank/CC source files — privacy boundary)
 *   - capitalEntries / financialInstitutions (cross-business)
 *   - vatPayments (per-user filing record, owner-scoped)
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

  // Source of truth for "categories scoped to this business" is the in-app
  // subjectStore (localStorage `finance-categories`) — that's where Category
  // rows carry their `businessId`. The IndexedDB `categories` table is a
  // sync mirror whose rows currently all have `businessId = null` (the
  // [[project_business_attribution_hole]]), so a businessId-filter against it
  // returns 0 — which is why pre-fix sharees got empty Expenses/Income tabs.
  //
  // We pull AH-scoped categories straight from subjectStore, derive the name
  // list, and also keep any legacy `businessCategories` rows that genuinely
  // mention this business (mostly empty in current data, harmless to ship).
  const scopedCategories = subjectStore.getForBusiness(businessId)
  const categoryNames = Array.from(new Set(
    scopedCategories.map(c => c.name).filter(Boolean)
  ))
  const categories = scopedCategories

  const allBusinessCategories = await db.businessCategories.toArray()
  const businessCategories = allBusinessCategories.filter(
    bc => bc.business === business.name
  )

  // Collect transactions tagged with any of those categories. Filtering in JS
  // (rather than via Dexie .where().anyOf()) because Transaction.category is
  // unindexed and the in-memory pass over the user's transaction table is
  // small enough not to matter (typically a few thousand rows).
  const allTransactions = await db.transactions.toArray()
  const categorySet = new Set(categoryNames)
  const transactions = categorySet.size > 0
    ? allTransactions.filter(t => t.category && categorySet.has(t.category))
    : []

  // Collect documents linked to those transactions. ypayDocuments.transactionId
  // is stored as String(t.id); expenseDocuments.transactionId is a number.
  const transactionIds = transactions.map(t => t.id!).filter(Boolean)
  const transactionIdStrSet = new Set(transactionIds.map(String))
  const transactionIdNumSet = new Set(transactionIds)

  const [allYpayDocs, allExpenseDocs] = await Promise.all([
    db.ypayDocuments.toArray(),
    db.expenseDocuments.toArray(),
  ])
  // ypayDocuments belong to the business via either a linked transaction (paid)
  // OR via their `projectName` matching one of the business's projects (open /
  // unpaid invoice). OpenDocumentsTab + InvoicesTab read by projectName, so
  // sharee needs both shapes.
  const projectNameSet = new Set(projects.map(p => p.name).filter(Boolean))
  const ypayDocuments = allYpayDocs.filter(d =>
    transactionIdStrSet.has(d.transactionId) ||
    (d.projectName && projectNameSet.has(d.projectName))
  )
  // Include two flavors of expenseDocument:
  //   (a) linked to one of our transactions (standard receipt-on-bank-charge)
  //   (b) partner-paid for THIS business (no transactionId, paidByUid set,
  //       businessId matches owner-side AH). ExpenseTab.tsx:279 surfaces (b)
  //       as "partner-paid" rows; sharee needs them to compute the
  //       "~1000 at Nadar's side" figure and the Settlement balance.
  const expenseDocuments = allExpenseDocs.filter(d => {
    if (d.transactionId !== undefined && transactionIdNumSet.has(d.transactionId)) return true
    if (!d.transactionId && d.paidByUid && d.businessId === businessId) return true
    return false
  })

  // Build mini backup — every field the business-view tabs read for this
  // business. Tables NOT relevant to a single business (importedFiles,
  // capitalEntries, etc.) are left empty so the merge doesn't touch them.
  const stores: any = {
    businesses: [business],
    categories,
    appSettings: [],
    businessCategories,
    importedFiles: [],
    transactions,
    tasks: [],
    financialInstitutions: [],
    capitalEntries: [],
    ypayDocuments,
    expenseDocuments,
    projects,
    harvestTasks,
    timeEntries,
    taxDocuments,
    advancePayments,
    businessTasks,
    subjectStore: null,
    timerStore: null,
    // Business-scoped Category rows the sharee must add to their subjectStore
    // (localStorage `finance-categories`) so IncomeTab/ExpenseTab — which read
    // from subjectStore, not the IndexedDB mirror — can see them. We carry
    // them out-of-band (not in `subjectStore`) because the standard
    // subjectStore import path is overwrite-not-merge and would clobber the
    // sharee's own household categories. Sharee-side merge in
    // applySharedBackup() does the safe add.
    sharedSubjectCategories: scopedCategories,
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

  // Sharee-side: remap businessId on partner-paid expenseDocuments. The
  // FK_RELATIONS table at applyMergedBackupService.ts:41 declares only
  // `transactionId` for expenseDocuments (because that's the primary FK for
  // bank-receipt matching), but partner-paid docs (`!transactionId`) carry the
  // owner's local businessId instead. ExpenseTab.tsx:279 filters them by
  // `d.businessId === business.id`, so without remap the sharee sees 0
  // partner-paid rows even though the docs are in their DB.
  if (!isOwner) {
    const ownerBizId = cloud.stores.businesses?.[0]?.id
    const localBiz = await db.businesses.where('syncId').equals(businessSyncId).first()
    const localBizId = localBiz?.id
    if (ownerBizId != null && localBizId != null && ownerBizId !== localBizId) {
      // businessId is not a Dexie index on expenseDocuments, so `.where`
      // throws; scan in-memory then patch by primary key.
      const all = await db.expenseDocuments.toArray()
      const toFix = all.filter(d => d.businessId === ownerBizId)
      for (const d of toFix) {
        if (d.id != null) {
          await db.expenseDocuments.update(d.id, { businessId: localBizId })
        }
      }
    }
  }

  // Sharee-side: merge the owner's business-scoped categories into the local
  // subjectStore (localStorage). Owner-side: skip — owner already authored them.
  //
  // Categories carry the OWNER's local businessId (e.g. 5); the sharee's local
  // AH business has its own auto-incremented id (e.g. 1). We remap by looking
  // up the sharee's local business via the businessSyncId after the IndexedDB
  // merge has landed it — same FK strategy applyMergedBackupService uses for
  // its remap relations (#54).
  if (!isOwner) {
    const incomingCats: any[] = (cloud.stores as any).sharedSubjectCategories || []
    if (incomingCats.length > 0) {
      const localBiz = await db.businesses.where('syncId').equals(businessSyncId).first()
      const localBizId = localBiz?.id
      const raw = subjectStore.getRaw() || { categories: [], classifications: [] }
      const existing: any[] = Array.isArray(raw.categories) ? raw.categories : []
      const byId = new Map<string, any>()
      for (const c of existing) if (c?.id) byId.set(String(c.id), c)
      for (const c of incomingCats) {
        if (!c?.id) continue
        byId.set(String(c.id), localBizId != null ? { ...c, businessId: localBizId } : c)
      }
      subjectStore.saveAll(Array.from(byId.values()))
    }
  }

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
  return `backups/${VARIANT}/shared/${businessSyncId}/${fileName}`
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
    // verifyPasswordWithToken signature is (token, password) — passing the
    // args in the wrong order always returned false, so the password test
    // could never succeed regardless of the actual password.
    return await verifyPasswordWithToken(token, password)
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
 * Delete the locally-stored password for a shared business (e.g. when the
 * sharee removes access locally).
 */
export async function deleteSharedPassword(businessSyncId: string): Promise<void> {
  const key = `sharedPassword_${businessSyncId}`
  const existing = await db.appSettings.where('key').equals(key).first()
  if (existing?.id != null) {
    await db.appSettings.delete(existing.id)
  }
}

const DISMISSED_SHARED_KEY = 'dismissedSharedBusinesses'

/**
 * Returns the set of shared-business syncIds the user has locally dismissed
 * (i.e. hidden from the header indicator without a server-side revocation).
 */
export async function getDismissedSharedBusinessIds(): Promise<Set<string>> {
  const row = await db.appSettings.where('key').equals(DISMISSED_SHARED_KEY).first()
  const list = row?.value
  return new Set(Array.isArray(list) ? list : [])
}

/**
 * Mark a shared business as locally dismissed so it no longer appears in the
 * header indicator. Does NOT revoke the server-side grant.
 */
export async function dismissSharedBusiness(bizSyncId: string): Promise<void> {
  const dismissed = await getDismissedSharedBusinessIds()
  dismissed.add(bizSyncId)
  const arr = Array.from(dismissed)
  const existing = await db.appSettings.where('key').equals(DISMISSED_SHARED_KEY).first()
  if (existing?.id != null) {
    await db.appSettings.update(existing.id, { value: arr, updatedAt: new Date().toISOString() })
  } else {
    await db.appSettings.add({ key: DISMISSED_SHARED_KEY, value: arr, updatedAt: new Date().toISOString() })
  }
}

/**
 * Owner-side: reset the shared-business encryption password.
 *
 * Used when the owner has lost the old password OR wants to rotate. Skips
 * the normal download-merge-upload dance (which needs the old password)
 * and instead:
 *
 *   1. Overwrites the verification token with the new password.
 *   2. Exports the owner's CURRENT local Dexie state for this business
 *      and re-uploads it encrypted with the new password (no generation
 *      check — this is a force overwrite).
 *   3. Saves the new password locally so subsequent sync calls use it.
 *
 * Effect on sharees: their cached old password is now wrong. They need
 * the new password to decrypt subsequent backups — exactly the rotation
 * UX. Their old cached decrypted data is unaffected; only the next
 * download fails until they enter the new password.
 */
export async function resetSharedPassword(
  businessSyncId: string,
  newPassword: string,
): Promise<SyncResult> {
  if (!newPassword?.trim()) {
    return { success: false, error: 'סיסמה ריקה', errorCode: 'empty-password' }
  }
  const setup = await setupSharedPassword(businessSyncId, newPassword)
  if (!setup.success) return setup

  const localBackup = await exportBusinessData(businessSyncId)
  if (!localBackup) {
    // No local data to upload — verification token alone is enough for now;
    // any future local edits will sync up.
    await saveSharedPassword(businessSyncId, newPassword)
    return { success: true }
  }
  const upload = await uploadSharedBackup(businessSyncId, localBackup, newPassword)
  if (!upload.success) return upload

  await saveSharedPassword(businessSyncId, newPassword)
  return { success: true }
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
      const classified = classifySyncError(err)
      // Permission-denied won't fix itself on retry — surface it immediately.
      if (classified.errorCode === 'permission-denied') {
        return { success: false, error: classified.error, errorCode: classified.errorCode }
      }
      if (attempt === MAX_RETRIES - 1) {
        return { success: false, error: classified.error, errorCode: classified.errorCode }
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
      dispatchSharedSyncStatus({ bizSyncId, status: 'no-password' })
      continue
    }

    const result = await syncSharedBusiness(bizSyncId, password)
    if (!result.success) {
      console.error(`[SharedSync] Failed to sync ${bizSyncId}:`, result.error)
      dispatchSharedSyncStatus({
        bizSyncId,
        status: 'error',
        errorCode: result.errorCode,
        error: result.error,
      })
    } else {
      dispatchSharedSyncStatus({ bizSyncId, status: 'ok' })
    }
  }
}
