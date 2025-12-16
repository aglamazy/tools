// Google Drive Picker helper for selecting folders

export type PickerFolder = { id: string; name: string }

const PICKER_SCRIPT_URL = 'https://apis.google.com/js/api.js'

let pickerLoaderPromise: Promise<void> | null = null

function injectPickerScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser-only'))
  const gapi = (window as any).gapi
  if (gapi && gapi.load) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PICKER_SCRIPT_URL}"]`) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load picker script')))
      return
    }

    const script = document.createElement('script')
    script.src = PICKER_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load picker script'))
    document.head.appendChild(script)
  })
}

export function loadPickerApi(): Promise<void> {
  if (pickerLoaderPromise) return pickerLoaderPromise
  if (typeof window === 'undefined') return Promise.reject(new Error('browser-only'))

  pickerLoaderPromise = new Promise(async (resolve, reject) => {
    try {
      await injectPickerScript()
      const gapi = (window as any).gapi
      gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Failed to load picker module')),
      })
    } catch (err) {
      reject(err)
    }
  })

  return pickerLoaderPromise
}

export function openFolderPicker(options: {
  apiKey: string
  token: string
  onPicked: (folder: PickerFolder) => void
  onCancel?: () => void
}) {
  if (typeof window === 'undefined') throw new Error('browser-only')
  const { apiKey, token, onPicked, onCancel } = options

  const pickerApi = (window as any)?.google?.picker

  if (!pickerApi) {
    throw new Error('Picker API not loaded')
  }

  // Root My Drive folders
  const myDriveView = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder')
    .setOwnedByMe(true)
    .setMode(pickerApi.DocsViewMode.LIST)

  // Shared drives (folders only)
  const sharedDrivesView = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder')
    .setEnableDrives(true)
    .setOwnedByMe(false)
    .setMode(pickerApi.DocsViewMode.LIST)

  const picker = new pickerApi.PickerBuilder()
    .setDeveloperKey(apiKey)
    .setOAuthToken(token)
    .addView(myDriveView)
    .addView(sharedDrivesView)
    .enableFeature(pickerApi.Feature.SUPPORT_TEAM_DRIVES)
    .setCallback((data: any) => {
      if (data.action === pickerApi.Action.PICKED && data.docs && data.docs.length > 0) {
        const doc = data.docs[0]
        onPicked({ id: doc.id, name: doc.name || doc.id })
      } else if (data.action === pickerApi.Action.CANCEL) {
        onCancel?.()
      }
    })
    .build()

  picker.setVisible(true)
}
