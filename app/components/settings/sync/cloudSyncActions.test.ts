import { beforeEach, describe, expect, it, vi } from 'vitest'

const svc = {
  hasEncryptionPasswordSetup: vi.fn(),
  syncMerge: vi.fn(async (_p: string) => ({ success: true })),
  restoreFromCloud: vi.fn(async (_p: string) => ({ success: true })),
}
vi.mock('@/app/services/cloudBackupService', () => ({
  hasEncryptionPasswordSetup: () => svc.hasEncryptionPasswordSetup(),
  syncMerge: (p: string) => svc.syncMerge(p),
  restoreFromCloud: (p: string) => svc.restoreFromCloud(p),
}))

import { startUpload, type SyncActionUi } from './cloudSyncActions'

const ACCESS = 'השרת סירב לגישה לגיבוי. הסיסמה שלך לא השתנתה; נסה שוב מאוחר יותר.'

function makeUi() {
  return {
    setMessage: vi.fn(),
    setSyncStatus: vi.fn(),
    openPasswordModal: vi.fn(),
    onUploadSuccess: vi.fn(),
    onDownloadSuccess: vi.fn(),
  } satisfies SyncActionUi
}

beforeEach(() => {
  svc.hasEncryptionPasswordSetup.mockReset()
  svc.syncMerge.mockClear()
})

describe('Settings > Sync "upload backup" click (aglamazo#461)', () => {
  it('with a session password calls syncMerge once, no modal', async () => {
    svc.hasEncryptionPasswordSetup.mockResolvedValue({ state: 'present' })
    const ui = makeUi()
    await startUpload(ui, 'session-pw')
    expect(svc.syncMerge).toHaveBeenCalledTimes(1)
    expect(svc.syncMerge).toHaveBeenCalledWith('session-pw')
    expect(ui.onUploadSuccess).toHaveBeenCalledWith('session-pw')
    expect(ui.openPasswordModal).not.toHaveBeenCalled()
  })

  it('refused read shows the access message and offers no setup', async () => {
    svc.hasEncryptionPasswordSetup.mockResolvedValue({ state: 'error', error: ACCESS, errorCode: 'permission-denied' })
    const ui = makeUi()
    await startUpload(ui, 'session-pw')
    expect(ui.setMessage).toHaveBeenCalledWith(ACCESS)
    expect(ui.openPasswordModal).not.toHaveBeenCalled()
    expect(svc.syncMerge).not.toHaveBeenCalled()
  })

  it('no password set up opens setup', async () => {
    svc.hasEncryptionPasswordSetup.mockResolvedValue({ state: 'absent' })
    const ui = makeUi()
    await startUpload(ui, null)
    expect(ui.openPasswordModal).toHaveBeenCalledWith('setup', 'upload')
  })

  it('password set up, none in session, asks for it', async () => {
    svc.hasEncryptionPasswordSetup.mockResolvedValue({ state: 'present' })
    const ui = makeUi()
    await startUpload(ui, null)
    expect(ui.openPasswordModal).toHaveBeenCalledWith('enter', 'upload')
    expect(svc.syncMerge).not.toHaveBeenCalled()
  })

  it('a failed sync shows its error', async () => {
    svc.hasEncryptionPasswordSetup.mockResolvedValue({ state: 'present' })
    svc.syncMerge.mockResolvedValueOnce({ success: false, error: ACCESS } as never)
    const ui = makeUi()
    await startUpload(ui, 'pw')
    expect(ui.setMessage).toHaveBeenLastCalledWith(ACCESS)
    expect(ui.onUploadSuccess).not.toHaveBeenCalled()
  })
})
