/**
 * Upload/restore actions of Settings > Sync, kept out of the component so the
 * action is always passed explicitly (aglamazo#461: handleUpload used to set
 * pendingAction and call handlePasswordSuccess in the same tick, which read the
 * stale null and returned silently) and so each branch is unit-testable.
 */
import {
  hasEncryptionPasswordSetup,
  syncMerge,
  restoreFromCloud,
} from '@/app/services/cloudBackupService'

export type SyncAction = 'upload' | 'download'

export type SyncActionUi = {
  setMessage: (message: string | null) => void
  setSyncStatus: (status: 'idle' | 'uploading' | 'downloading') => void
  /** Open the password modal; its onSuccess must call runSyncAction(action, …). */
  openPasswordModal: (mode: 'setup' | 'enter', action: SyncAction) => void
  onUploadSuccess: (password: string) => Promise<void> | void
  onDownloadSuccess: (password: string) => Promise<void> | void
}

/**
 * The "upload backup" click. A backup that cannot be read (403, network) shows
 * the access message and never offers to set a new password — that would
 * overwrite verify.enc and orphan backup.enc (aglamazo#461).
 */
export async function startUpload(ui: SyncActionUi, sessionPassword: string | null): Promise<void> {
  const setup = await hasEncryptionPasswordSetup()
  if (setup.state === 'error') {
    ui.setMessage(setup.error)
    return
  }
  if (setup.state === 'absent') {
    ui.openPasswordModal('setup', 'upload')
    return
  }
  if (sessionPassword) {
    await runSyncAction('upload', sessionPassword, ui)
    return
  }
  ui.openPasswordModal('enter', 'upload')
}

export async function runSyncAction(action: SyncAction, password: string, ui: SyncActionUi): Promise<void> {
  ui.setMessage(null)
  if (action === 'upload') {
    ui.setSyncStatus('uploading')
    const result = await syncMerge(password)
    ui.setSyncStatus('idle')
    if (result.success) await ui.onUploadSuccess(password)
    else ui.setMessage(result.error || 'שגיאה בסנכרון')
    return
  }
  ui.setSyncStatus('downloading')
  const result = await restoreFromCloud(password)
  ui.setSyncStatus('idle')
  if (result.success) await ui.onDownloadSuccess(password)
  else ui.setMessage(result.error || 'שגיאה בשחזור הנתונים')
}
