/**
 * Station Lock Service
 * Manages multi-device sync coordination using lock files in Firebase Storage
 */

import { ref, uploadString, getBytes, getMetadata } from 'firebase/storage'
import { getFirebaseStorage, isFirebaseConfigured } from '@/app/lib/firebase'
import { getCurrentUser } from './firebaseAuthService'

export type StationLock = {
  stationId: string
  acquiredAt: string // ISO timestamp
  lastActivity: string // ISO timestamp
  ttlSeconds: number // Lock expires after this many seconds of inactivity
}

const LOCK_FILE_NAME = 'lock.json'

/**
 * Get the storage path for user's lock file
 */
function getLockPath(uid: string): string {
  return `backups/${uid}/${LOCK_FILE_NAME}`
}

/**
 * Check if a lock is stale based on lastActivity timestamp
 */
export function isLockStale(lock: StationLock): boolean {
  const now = Date.now()
  const lastActivity = new Date(lock.lastActivity).getTime()
  const ageMs = now - lastActivity
  return ageMs > lock.ttlSeconds * 1000
}

/**
 * Upload lock file to Firebase Storage
 */
export async function uploadStationLock(
  lock: StationLock
): Promise<{ success: boolean; error?: string }> {
  const user = getCurrentUser()
  if (!user) {
    return { success: false, error: 'not-authenticated' }
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: 'not-configured' }
  }

  try {
    const storage = getFirebaseStorage()
    const lockRef = ref(storage, getLockPath(user.uid))
    await uploadString(lockRef, JSON.stringify(lock))
    return { success: true }
  } catch (err: any) {
    console.error('[StationLock] Upload failed:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}

/**
 * Download lock file from Firebase Storage
 */
export async function downloadStationLock(): Promise<{
  success: boolean
  lock?: StationLock
  error?: string
}> {
  const user = getCurrentUser()
  if (!user) {
    return { success: false, error: 'not-authenticated' }
  }

  if (!isFirebaseConfigured()) {
    return { success: false, error: 'not-configured' }
  }

  try {
    const storage = getFirebaseStorage()
    const lockRef = ref(storage, getLockPath(user.uid))

    // Check if file exists
    try {
      await getMetadata(lockRef)
    } catch (err: any) {
      if (err.code === 'storage/object-not-found') {
        return { success: false, error: 'no-file' }
      }
      throw err
    }

    const bytes = await getBytes(lockRef)
    const lock = JSON.parse(new TextDecoder().decode(bytes)) as StationLock

    return { success: true, lock }
  } catch (err: any) {
    console.error('[StationLock] Download failed:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}
