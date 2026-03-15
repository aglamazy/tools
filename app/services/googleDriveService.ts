/**
 * Google Drive Service
 * Uploads, organises, and deletes files in Google Drive using the v3 REST API.
 *
 * Folder structure:
 *   My Drive / Aglamazo Tax Documents / <files>
 *
 * Auth is handled via googleTokenService (OAuth2 access + refresh tokens).
 */

import {
  getAccessToken,
  hasGoogleAccess,
  requestGoogleAccess,
  clearGoogleAccess,
} from '@/app/services/googleTokenService'

// Re-export connection-management helpers for convenience
export { hasGoogleAccess, requestGoogleAccess, clearGoogleAccess }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files'
const AGLAMAZO_ROOT = 'Aglamazo'
const TAX_FOLDER_NAME = 'Tax Documents'
const EXPENSE_FOLDER_NAME = 'Expense Documents'
const ADVANCE_FOLDER_NAME = 'Advance Payments'
// Legacy folder names (for migration)
const LEGACY_TAX_FOLDER = 'Aglamazo Tax Documents'
const LEGACY_EXPENSE_FOLDER = 'Aglamazo Expense Documents'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Perform an authenticated fetch against the Google Drive API.
 * On a 401, attempts a single token refresh and retries.
 */
async function driveFetch(
  url: string,
  init: RequestInit = {},
  _retried = false,
): Promise<Response> {
  const token = await getAccessToken()
  if (!token) {
    throw new Error('No Google access token available. Please connect your Google account first.')
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401 && !_retried) {
    // Token may have expired between check and use; getAccessToken auto-refreshes
    return driveFetch(url, init, true)
  }

  return res
}

/**
 * Find a folder by name inside a given parent (or root).
 * Returns the folder id or null.
 */
async function findFolder(
  name: string,
  parentId?: string,
): Promise<string | null> {
  const parentClause = parentId ? `'${parentId}' in parents and ` : ''
  const q = `${parentClause}mimeType='${FOLDER_MIME}' and name='${name}' and trashed=false`

  const params = new URLSearchParams({
    q,
    fields: 'files(id)',
    pageSize: '1',
  })

  const res = await driveFetch(`${DRIVE_API}?${params.toString()}`)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive search failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

/**
 * Create a folder with the given name inside an optional parent.
 * Returns the new folder id.
 */
async function createFolder(
  name: string,
  parentId?: string,
): Promise<string> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: FOLDER_MIME,
  }
  if (parentId) {
    metadata.parents = [parentId]
  }

  const res = await driveFetch(DRIVE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive folder creation failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.id as string
}

/**
 * Get or create a folder, returning its id.
 */
async function getOrCreateFolder(
  name: string,
  parentId?: string,
): Promise<string> {
  const existing = await findFolder(name, parentId)
  if (existing) return existing
  return createFolder(name, parentId)
}

// ---------------------------------------------------------------------------
// Migration: move legacy top-level folders into Aglamazo root
// ---------------------------------------------------------------------------

async function moveToParent(fileId: string, newParentId: string): Promise<void> {
  // Get current parents
  const metaRes = await driveFetch(`${DRIVE_API}/${encodeURIComponent(fileId)}?fields=parents`)
  if (!metaRes.ok) return
  const meta = await metaRes.json()
  const oldParents = (meta.parents || []).join(',')

  const params = new URLSearchParams({ addParents: newParentId, removeParents: oldParents })
  await driveFetch(`${DRIVE_API}/${encodeURIComponent(fileId)}?${params.toString()}`, { method: 'PATCH' })
}

/**
 * List all files/folders inside a given parent folder.
 */
async function listChildren(
  parentId: string,
): Promise<{ id: string; name: string; mimeType: string; createdTime?: string }[]> {
  const items: { id: string; name: string; mimeType: string; createdTime?: string }[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,createdTime)',
      pageSize: '100',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await driveFetch(`${DRIVE_API}?${params.toString()}`)
    if (!res.ok) break
    const data = await res.json()
    items.push(...(data.files || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return items
}

/**
 * Merge duplicate-named subfolders: if two folders share the same name,
 * move all children from the duplicate into the first one, then trash the duplicate.
 */
async function mergeDuplicateFolders(parentId: string): Promise<void> {
  const children = await listChildren(parentId)
  const folders = children.filter(c => c.mimeType === FOLDER_MIME)

  // Group folders by name
  const byName = new Map<string, string[]>()
  for (const f of folders) {
    const ids = byName.get(f.name) || []
    ids.push(f.id)
    byName.set(f.name, ids)
  }

  for (const [, ids] of byName) {
    if (ids.length <= 1) continue
    const keepId = ids[0]
    for (let i = 1; i < ids.length; i++) {
      const dupeChildren = await listChildren(ids[i])
      for (const child of dupeChildren) {
        await moveToParent(child.id, keepId)
      }
      await driveFetch(`${DRIVE_API}/${encodeURIComponent(ids[i])}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      })
    }
  }
}

/**
 * Merge short-year subfolders (e.g. "26") into full-year folders ("2026"),
 * move loose files into year folders by filename date, and dedup folders.
 */
async function migrateSubfolders(parentId: string): Promise<void> {
  const children = await listChildren(parentId)
  const folders = children.filter(c => c.mimeType === FOLDER_MIME)
  const files = children.filter(c => c.mimeType !== FOLDER_MIME)

  // 1. Merge short-year folders (e.g. "26" → "2026")
  for (const folder of folders) {
    if (/^\d{2}$/.test(folder.name)) {
      const fullYear = `20${folder.name}`
      const targetId = await getOrCreateFolder(fullYear, parentId)

      const shortChildren = await listChildren(folder.id)
      for (const child of shortChildren) {
        await moveToParent(child.id, targetId)
      }

      await driveFetch(`${DRIVE_API}/${encodeURIComponent(folder.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      })
    }
  }

  // 2. Move loose files into year folders
  //    First try date pattern in filename, then fall back to createdTime from Drive
  for (const file of files) {
    let year: string | null = null
    const yearMatch = file.name.match(/\b(20\d{2})[-_.\s]?\d{2}[-_.\s]?\d{2}\b/)
    if (yearMatch) {
      year = yearMatch[1]
    } else if (file.createdTime) {
      year = file.createdTime.slice(0, 4) // ISO date: "2026-03-08T..."
    }
    if (year) {
      const yearFolder = await getOrCreateFolder(year, parentId)
      await moveToParent(file.id, yearFolder)
    }
  }

  // 3. Clean up wrongly-created year folders (e.g. "2067" from false regex matches)
  const refreshed = await listChildren(parentId)
  const badYearFolders = refreshed.filter(c =>
    c.mimeType === FOLDER_MIME && /^20\d{2}$/.test(c.name) && parseInt(c.name) > new Date().getFullYear() + 5
  )
  for (const bad of badYearFolders) {
    const badChildren = await listChildren(bad.id)
    for (const child of badChildren) {
      await moveToParent(child.id, parentId)
    }
    await driveFetch(`${DRIVE_API}/${encodeURIComponent(bad.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  }

  // 4. Merge duplicate-named subfolders (e.g. two "02" folders inside 2026)
  // Re-fetch children since structure changed, then dedup recursively inside year folders
  const updatedChildren = await listChildren(parentId)
  await mergeDuplicateFolders(parentId)
  const yearFolders = updatedChildren.filter(c => c.mimeType === FOLDER_MIME && /^20\d{2}$/.test(c.name))
  for (const yf of yearFolders) {
    await mergeDuplicateFolders(yf.id)
  }
}

async function migrateLegacyFolder(legacyName: string, newName: string, rootId: string): Promise<string> {
  // Check if legacy folder exists at top level
  const legacyId = await findFolder(legacyName)
  if (legacyId) {
    // Rename it and move it under root
    await driveFetch(`${DRIVE_API}/${encodeURIComponent(legacyId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    await moveToParent(legacyId, rootId)
    return legacyId
  }
  // Otherwise just create it fresh
  return getOrCreateFolder(newName, rootId)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Cache for root folder id to avoid repeated lookups */
let _rootFolderId: string | null = null
let _migrationDone = false

/**
 * Ensure the Aglamazo root folder exists and migrate legacy folders if needed.
 * Structure: My Drive / Aglamazo / { Tax Documents, Expense Documents, Advance Payments }
 */
export async function ensureRootFolder(): Promise<string> {
  if (_rootFolderId && _migrationDone) return _rootFolderId
  _rootFolderId = await getOrCreateFolder(AGLAMAZO_ROOT)

  if (!_migrationDone) {
    _migrationDone = true
    // Migrate legacy top-level folders into Aglamazo root
    const taxFolderId = await migrateLegacyFolder(LEGACY_TAX_FOLDER, TAX_FOLDER_NAME, _rootFolderId).catch(() => null)
    const expFolderId = await migrateLegacyFolder(LEGACY_EXPENSE_FOLDER, EXPENSE_FOLDER_NAME, _rootFolderId).catch(() => null)
    // Migrate subfolders: merge short years, move loose files, dedup duplicates
    if (taxFolderId) await migrateSubfolders(taxFolderId).catch(() => {})
    if (expFolderId) await migrateSubfolders(expFolderId).catch(() => {})
  }

  return _rootFolderId
}

/**
 * Ensure the tax documents folder exists:
 *   My Drive / Aglamazo / Tax Documents
 */
export async function ensureFolder(): Promise<string> {
  const rootId = await ensureRootFolder()
  return getOrCreateFolder(TAX_FOLDER_NAME, rootId)
}

/**
 * Ensure the expense documents folder exists:
 *   My Drive / Aglamazo / Expense Documents
 */
export async function ensureExpenseFolder(): Promise<string> {
  const rootId = await ensureRootFolder()
  return getOrCreateFolder(EXPENSE_FOLDER_NAME, rootId)
}

/**
 * Ensure the advance payments folder exists:
 *   My Drive / Aglamazo / Advance Payments
 */
export async function ensureAdvancePaymentsFolder(): Promise<string> {
  const rootId = await ensureRootFolder()
  return getOrCreateFolder(ADVANCE_FOLDER_NAME, rootId)
}

/**
 * Upload a file to a specific Drive folder using multipart upload.
 * Shared helper used by all public upload functions.
 */
async function uploadToFolder(
  file: File,
  folderId: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const metadata = JSON.stringify({
    name: file.name,
    parents: [folderId],
  })

  const boundary = `----AglamazoBoundary${Date.now()}`
  const CRLF = '\r\n'

  const metadataPart =
    `--${boundary}${CRLF}` +
    `Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}` +
    `${metadata}${CRLF}`

  const filePart =
    `--${boundary}${CRLF}` +
    `Content-Type: ${file.type || 'application/octet-stream'}${CRLF}${CRLF}`

  const closing = `${CRLF}--${boundary}--`

  const encoder = new TextEncoder()
  const metaBytes = encoder.encode(metadataPart)
  const filePartBytes = encoder.encode(filePart)
  const closingBytes = encoder.encode(closing)
  const fileBytes = new Uint8Array(await file.arrayBuffer())

  const body = new Uint8Array(
    metaBytes.length + filePartBytes.length + fileBytes.length + closingBytes.length,
  )
  let offset = 0
  body.set(metaBytes, offset); offset += metaBytes.length
  body.set(filePartBytes, offset); offset += filePartBytes.length
  body.set(fileBytes, offset); offset += fileBytes.length
  body.set(closingBytes, offset)

  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,webViewLink',
  })

  const res = await driveFetch(`${DRIVE_UPLOAD_API}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: body.buffer,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive upload failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return {
    fileId: data.id as string,
    webViewLink: data.webViewLink as string,
  }
}

/**
 * Upload a tax document to Google Drive.
 * Folder: Aglamazo / Tax Documents / <year>
 */
export async function uploadTaxDocument(
  file: File,
  year?: number,
): Promise<{ fileId: string; webViewLink: string }> {
  let folderId = await ensureFolder()
  if (year) {
    folderId = await getOrCreateFolder(String(year), folderId)
  }
  return uploadToFolder(file, folderId)
}

/**
 * Upload an expense document (receipt/invoice) to Google Drive.
 * Folder: Aglamazo / Expense Documents / <year> / <month>
 */
export async function uploadExpenseDocument(
  file: File,
  date?: { year: string; month: string },
): Promise<{ fileId: string; webViewLink: string }> {
  let folderId = await ensureExpenseFolder()
  if (date) {
    folderId = await getOrCreateFolder(date.year, folderId)
    folderId = await getOrCreateFolder(date.month, folderId)
  }
  return uploadToFolder(file, folderId)
}

/**
 * Upload an advance payment receipt to Google Drive.
 * Folder: Aglamazo / Advance Payments / <year>
 */
export async function uploadAdvancePaymentReceipt(
  file: File,
  year: number,
): Promise<{ fileId: string; webViewLink: string }> {
  let folderId = await ensureAdvancePaymentsFolder()
  folderId = await getOrCreateFolder(String(year), folderId)
  return uploadToFolder(file, folderId)
}

/**
 * Download a file's content from Google Drive as base64.
 * Returns `{ base64, mimeType }`.
 */
export async function downloadDriveFile(fileId: string): Promise<{ base64: string; mimeType: string }> {
  // Get file metadata for mimeType
  const metaRes = await driveFetch(
    `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=mimeType`,
  )
  if (!metaRes.ok) {
    throw new Error(`Drive metadata fetch failed (${metaRes.status})`)
  }
  const meta = await metaRes.json()

  // Download content
  const res = await driveFetch(
    `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`,
  )
  if (!res.ok) {
    throw new Error(`Drive download failed (${res.status})`)
  }

  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  return { base64, mimeType: meta.mimeType as string }
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const res = await driveFetch(`${DRIVE_API}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  })

  // 204 = success, 404 = already gone — both are fine
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const err = await res.text()
    throw new Error(`Drive delete failed (${res.status}): ${err}`)
  }
}
