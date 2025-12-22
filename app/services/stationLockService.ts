/**
 * Station Lock Service
 * Manages multi-device sync coordination using lock files in Google Drive
 */

import { ensureDriveAccessToken } from './driveSyncService'

export type StationLock = {
  stationId: string
  acquiredAt: string // ISO timestamp
  lastActivity: string // ISO timestamp
  ttlSeconds: number // Lock expires after this many seconds of inactivity
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
 * Upload lock file to Drive
 */
async function uploadLockFile(token: string, lock: StationLock, fileId?: string): Promise<string> {
  const boundary = '-------314159265358979323846'
  const delimiter = `--${boundary}\r\n`
  const closeDelimiter = `--${boundary}--`

  const metadata = fileId
    ? { name: 'finance-lock.json' }
    : { name: 'finance-lock.json', parents: ['appDataFolder'] }

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    '\r\n' +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(lock) +
    '\r\n' +
    closeDelimiter

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id'

  const method = fileId ? 'PATCH' : 'POST'

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Lock upload failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  return json.id as string
}

/**
 * Download lock file from Drive
 */
async function downloadLockFile(token: string, fileId: string): Promise<StationLock> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Lock download failed (${res.status}): ${text}`)
  }

  return await res.json()
}

/**
 * Find lock file ID in Drive
 */
async function findLockFileId(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='finance-lock.json'`,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
  })

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Lock file search failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  const files = (json.files || []) as Array<{ id: string }>
  if (files.length === 0) return null
  return files[0].id
}

/**
 * Upload station lock to Drive
 */
export async function uploadStationLock(options: {
  clientId: string
  lock: StationLock
  fileId?: string
}): Promise<{ success: boolean; fileId?: string; error?: string }> {
  const { clientId, lock, fileId } = options
  if (typeof window === 'undefined') return { success: false, error: 'browser-only' }

  try {
    const token = await ensureDriveAccessToken(clientId, { prompt: 'none' })
    if (!token) return { success: false, error: 'no-token' }

    const uploadedId = await uploadLockFile(token, lock, fileId)
    return { success: true, fileId: uploadedId }
  } catch (err: any) {
    console.error('Lock upload failed:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}

/**
 * Download station lock from Drive
 */
export async function downloadStationLock(options: {
  clientId: string
  fileId?: string
}): Promise<{ success: boolean; lock?: StationLock; fileId?: string; error?: string }> {
  const { clientId, fileId } = options
  if (typeof window === 'undefined') return { success: false, error: 'browser-only' }

  try {
    const token = await ensureDriveAccessToken(clientId, { prompt: 'none' })
    if (!token) return { success: false, error: 'no-token' }

    let targetFileId = fileId
    if (!targetFileId) {
      targetFileId = await findLockFileId(token) || undefined
      if (!targetFileId) return { success: false, error: 'no-file' }
    }

    const lock = await downloadLockFile(token, targetFileId)
    return { success: true, lock, fileId: targetFileId }
  } catch (err: any) {
    console.error('Lock download failed:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}
