import { ensureDriveAccessToken, DRIVE_FILE_SCOPE } from './driveSyncService'

export type DriveFolder = {
  id: string
  name: string
  modifiedTime?: string
}

type ListResult = {
  success: boolean
  folders?: DriveFolder[]
  error?: string
}

type ListOptions = {
  clientId: string
  searchTerm?: string
  pageSize?: number
}

export async function listDriveFolders(options: ListOptions): Promise<ListResult> {
  const { clientId, searchTerm = '', pageSize = 50 } = options
  if (typeof window === 'undefined') return { success: false, error: 'browser-only' }

  try {
    const token = await ensureDriveAccessToken(clientId, { prompt: 'consent', scopes: [DRIVE_FILE_SCOPE] })
    if (!token) return { success: false, error: 'no-token' }

    const sanitizedSearch = searchTerm.replace(/'/g, "\\'")
    const queryParts = [
      "mimeType = 'application/vnd.google-apps.folder'",
      'trashed = false',
    ]
    if (sanitizedSearch) {
      queryParts.push(`name contains '${sanitizedSearch}'`)
    }
    const params = new URLSearchParams({
      q: queryParts.join(' and '),
      pageSize: pageSize.toString(),
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,modifiedTime),nextPageToken',
      spaces: 'drive',
    })

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Drive folder list failed:', res.status, text)
      return { success: false, error: `folder-list-failed-${res.status}` }
    }

    const json = await res.json()
    const folders: DriveFolder[] = (json.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
    }))

    return { success: true, folders }
  } catch (err: any) {
    console.error('Error listing Drive folders:', err)
    return { success: false, error: err?.message || 'unknown-error' }
  }
}
