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
const ROOT_FOLDER_NAME = 'Aglamazo Tax Documents'
const EXPENSE_FOLDER_NAME = 'Aglamazo Expense Documents'
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the root folder exists:
 *   My Drive / Aglamazo Tax Documents
 *
 * Returns the folder id.
 */
export async function ensureFolder(): Promise<string> {
  return getOrCreateFolder(ROOT_FOLDER_NAME)
}

/**
 * Ensure the expense documents folder exists:
 *   My Drive / Aglamazo Expense Documents
 *
 * Returns the folder id.
 */
export async function ensureExpenseFolder(): Promise<string> {
  return getOrCreateFolder(EXPENSE_FOLDER_NAME)
}

/**
 * Upload a tax document to Google Drive under the business folder.
 *
 * Uses multipart upload (metadata + file content in a single request).
 *
 * @returns `{ fileId, webViewLink }` on success.
 */
export async function uploadTaxDocument(
  file: File,
): Promise<{ fileId: string; webViewLink: string }> {
  const folderId = await ensureFolder()

  const metadata = JSON.stringify({
    name: file.name,
    parents: [folderId],
  })

  const boundary = `----AglamazoBoundary${Date.now()}`
  const CRLF = '\r\n'

  // Build the multipart body manually
  const metadataPart =
    `--${boundary}${CRLF}` +
    `Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}` +
    `${metadata}${CRLF}`

  const filePart =
    `--${boundary}${CRLF}` +
    `Content-Type: ${file.type || 'application/octet-stream'}${CRLF}${CRLF}`

  const closing = `${CRLF}--${boundary}--`

  // Combine text parts with the binary file content
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
 * Upload an expense document (receipt/invoice) to Google Drive.
 *
 * Folder structure: Aglamazo Expense Documents / <year> / <month>
 * If no date provided, uploads to the root expense folder.
 *
 * @returns `{ fileId, webViewLink }` on success.
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
