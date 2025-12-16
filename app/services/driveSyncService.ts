// Google Drive Sync Service (client-side only)
// Handles GIS token acquisition and uploading backups to Drive appData

import { exportAllStores, type BackupData } from '@/app/services/backupService'
import { driveAuthStore, type DriveAuthState } from '@/app/stores/driveAuthStore'

const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.appdata']

type StoreCounts = {
  transactions: number
  importedFiles: number
  categories: number
  businessCategories: number
  tasks: number
  appSettings: number
}

type SyncResult = {
  success: boolean
  fileId?: string
  error?: string
}

type FetchResult = {
  success: boolean
  data?: any
  error?: string
  fileId?: string
}

let gsiLoaderPromise: Promise<void> | null = null

function summarizeStoreCounts(data: BackupData | any): StoreCounts | null {
  if (!data?.stores) return null
  return {
    transactions: data.stores.transactions?.length ?? 0,
    importedFiles: data.stores.importedFiles?.length ?? 0,
    categories: data.stores.categories?.length ?? 0,
    businessCategories: data.stores.businessCategories?.length ?? 0,
    tasks: data.stores.tasks?.length ?? 0,
    appSettings: data.stores.appSettings?.length ?? 0,
  }
}

function hasCoreBackupData(counts: StoreCounts | null): boolean {
  if (!counts) return false
  return counts.transactions > 0 && counts.importedFiles > 0
}

export function clearDriveAuth() {
  driveAuthStore.clear()
}

async function loadGsiClient(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('GIS must run in the browser')
  }

  if (gsiLoaderPromise) return gsiLoaderPromise

  gsiLoaderPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts?.oauth2) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = GSI_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
    document.head.appendChild(script)
  })

  return gsiLoaderPromise
}

function isTokenValid(auth: DriveAuthState | null): boolean {
  if (!auth) return false
  const now = Date.now()
  // Renew one minute before expiry
  return auth.expiresAt - 60_000 > now
}

async function requestAccessToken(clientId: string, prompt: 'consent' | 'none'): Promise<DriveAuthState> {
  await loadGsiClient()

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not available')
  }

  return new Promise((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPES.join(' '),
      prompt,
      callback: (response: any) => {
        if (response.error) {
          reject(response)
          return
        }

        const expiresIn = typeof response.expires_in === 'number' ? response.expires_in : 3600
        const auth: DriveAuthState = {
          accessToken: response.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
          scope: response.scope,
        }
        driveAuthStore.save(auth)
        resolve(auth)
      },
    })

    try {
      tokenClient.requestAccessToken({ prompt })
    } catch (err) {
      reject(err)
    }
  })
}

export async function ensureDriveAccessToken(clientId: string, opts?: { prompt?: 'consent' | 'none' }): Promise<string | null> {
  const prompt = opts?.prompt ?? 'none'
  const stored = driveAuthStore.get()

  if (isTokenValid(stored)) {
    return stored!.accessToken
  }

  try {
    const auth = await requestAccessToken(clientId, prompt)
    return auth.accessToken
  } catch (err) {
    console.error('Error acquiring Drive token:', err)
    return null
  }
}

async function uploadBackup(token: string, metadata: Record<string, any>, backup: any, fileId?: string): Promise<string> {
  const boundary = '-------314159265358979323846'
  const delimiter = `--${boundary}\r\n`
  const closeDelimiter = `--${boundary}--`

  // parents cannot be updated via PATCH; only include parents on create
  const sanitizedMetadata = fileId ? { ...metadata, parents: undefined } : metadata

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(sanitizedMetadata) +
    '\r\n' +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(backup) +
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
    throw new Error(`Drive upload failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  return json.id as string
}

async function downloadBackup(token: string, fileId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Drive download failed (${res.status}): ${text}`)
  }

  return await res.json()
}

async function findLatestBackupFileId(token: string, name: string): Promise<string | null> {
  const escapedName = name.replace(/'/g, "\\'")
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${escapedName}'`,
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
    throw new Error(`Drive list failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  const files = (json.files || []) as Array<{ id: string; name: string; modifiedTime: string }>
  if (files.length === 0) return null
  return files[0].id
}

async function getBackupMetadata(token: string, fileId?: string, fileName = 'finance-backup.json') {
  let targetFileId = fileId
  let modifiedTime: string | undefined

  try {
    if (targetFileId) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${targetFileId}?fields=id,name,modifiedTime`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.ok) {
        const json = await res.json()
        modifiedTime = json.modifiedTime
      } else if (res.status === 404) {
        targetFileId = undefined
      } else {
        const text = await res.text()
        throw new Error(`Drive metadata failed (${res.status}): ${text}`)
      }
    }

    if (!targetFileId) {
      targetFileId = await findLatestBackupFileId(token, fileName) || undefined
      if (targetFileId) {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${targetFileId}?fields=id,name,modifiedTime`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        if (res.ok) {
          const json = await res.json()
          modifiedTime = json.modifiedTime
        }
      }
    }

    return { fileId: targetFileId, modifiedTime }
  } catch (err) {
    console.error('Drive metadata error:', err)
    return { fileId: targetFileId, modifiedTime }
  }
}

export async function exportBackupToDrive(options: {
  clientId: string
  fileId?: string
  useAppData?: boolean
  fileName?: string
}): Promise<SyncResult> {
  const { clientId, fileId, useAppData = true, fileName = 'finance-backup.json' } = options

  if (typeof window === 'undefined') return { success: false, error: 'browser-only' }

  try {
    // Try silent token; if missing, abort (UI should call again with prompt: 'consent')
    const token = await ensureDriveAccessToken(clientId, { prompt: 'none' })
    if (!token) {
      return { success: false, error: 'no-token' }
    }

    const backup = await exportAllStores()
    const storeCounts = summarizeStoreCounts(backup)
    if (!hasCoreBackupData(storeCounts)) {
      console.warn('[DriveSync] skip upload: backup missing core data', storeCounts)
      return { success: false, error: 'empty-backup' }
    }

    const metadata: Record<string, any> = {
      name: fileName,
    }

    if (useAppData) {
      metadata.parents = ['appDataFolder']
    }

    const uploadedId = await uploadBackup(token, metadata, backup, fileId)
    return { success: true, fileId: uploadedId }
  } catch (err: any) {
    console.error('Drive backup upload failed:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}

export async function interactiveConnectAndExport(options: {
  clientId: string
  existingFileId?: string
  useAppData?: boolean
  fileName?: string
}): Promise<SyncResult> {
  const { clientId, existingFileId, useAppData = true, fileName } = options

  try {
    const token = await ensureDriveAccessToken(clientId, { prompt: 'consent' })
    if (!token) return { success: false, error: 'consent-denied' }

    const backup = await exportAllStores()
    const storeCounts = summarizeStoreCounts(backup)
    if (!hasCoreBackupData(storeCounts)) {
      console.warn('[DriveSync] skip upload (interactive): backup missing core data', storeCounts)
      return { success: false, error: 'empty-backup' }
    }
    const metadata: Record<string, any> = { name: fileName || 'finance-backup.json' }
    if (useAppData) metadata.parents = ['appDataFolder']

    const uploadedId = await uploadBackup(token, metadata, backup, existingFileId)
    return { success: true, fileId: uploadedId }
  } catch (err: any) {
    console.error('Drive interactive export failed:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}

export async function fetchBackupFromDrive(options: {
  clientId: string
  fileId?: string
  fileName?: string
}): Promise<FetchResult> {
  const { clientId, fileId, fileName = 'finance-backup.json' } = options
  if (typeof window === 'undefined') return { success: false, error: 'browser-only' }

  try {
    console.log('[DriveSync] fetch backup start', { fileId, fileName })
    const token = await ensureDriveAccessToken(clientId, { prompt: 'none' })
    if (!token) return { success: false, error: 'no-token' }

    const meta = await getBackupMetadata(token, fileId, fileName)
    console.log('[DriveSync] backup metadata', meta)
    if (!meta.fileId) return { success: false, error: 'no-file' }

    const data = await downloadBackup(token, meta.fileId)
    const storeCounts =
      data?.stores
        ? {
            transactions: data.stores.transactions?.length ?? 0,
            importedFiles: data.stores.importedFiles?.length ?? 0,
            categories: data.stores.categories?.length ?? 0,
            businessCategories: data.stores.businessCategories?.length ?? 0,
            tasks: data.stores.tasks?.length ?? 0,
            appSettings: data.stores.appSettings?.length ?? 0,
          }
        : null
    console.log('[DriveSync] backup download completed', {
      fileId: meta.fileId,
      storeCounts,
      hasData: Boolean(data),
    })
    return { success: true, data, fileId: meta.fileId }
  } catch (err: any) {
    console.error('Drive backup download failed:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}

export async function getDriveBackupMetadata(options: {
  clientId: string
  fileId?: string
  fileName?: string
}): Promise<{ success: boolean; fileId?: string; modifiedTime?: string; error?: string }> {
  const { clientId, fileId, fileName = 'finance-backup.json' } = options
  if (typeof window === 'undefined') return { success: false, error: 'browser-only' }

  try {
    const token = await ensureDriveAccessToken(clientId, { prompt: 'none' })
    if (!token) return { success: false, error: 'no-token' }

    const meta = await getBackupMetadata(token, fileId, fileName)
    if (!meta.fileId) return { success: false, error: 'no-file' }
    return { success: true, fileId: meta.fileId, modifiedTime: meta.modifiedTime }
  } catch (err: any) {
    console.error('Drive metadata fetch failed:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}
