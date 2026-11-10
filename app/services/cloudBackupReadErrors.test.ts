import { beforeEach, describe, expect, it, vi } from 'vitest'

// aglamazo#461: a refused read (403) must never look like "no password set up"
// or "wrong password", and must never be told to re-login.

const storage = {
  getMetadata: vi.fn(),
  getBytes: vi.fn(),
  uploadString: vi.fn(async () => undefined),
}
const verifyPasswordWithToken = vi.fn(async () => true)

vi.mock('@/app/lib/firebase', () => ({
  isFirebaseConfigured: () => true,
  getFirebaseAuth: () => ({ currentUser: { uid: 'u1', getIdTokenResult: async () => ({ claims: {} }) } }),
  getFirebaseStorage: () => ({}),
}))
vi.mock('./firebaseAuthService', () => ({
  getCurrentUser: () => ({ uid: 'u1', email: 'a@b.c' }),
  getIdToken: async () => 'token',
}))
vi.mock('firebase/storage', () => ({
  ref: (_s: unknown, p: string) => ({ fullPath: p }),
  uploadString: (...a: unknown[]) => (storage.uploadString as any)(...a),
  getBytes: (...a: unknown[]) => storage.getBytes(...a),
  getMetadata: (...a: unknown[]) => storage.getMetadata(...a),
  deleteObject: async () => undefined,
}))
vi.mock('./encryptionService', () => ({
  encrypt: async (s: string) => s,
  decrypt: async (s: string) => s,
  generateVerificationToken: async () => 'token',
  verifyPasswordWithToken: (...a: unknown[]) => (verifyPasswordWithToken as any)(...a),
}))
vi.mock('./backupService', () => ({
  isLocalDataEmpty: async () => false,
  exportAllStores: async () => ({ version: 1, stores: {} }),
  importAllStores: async () => undefined,
}))
vi.mock('./applyMergedBackupService', () => ({ applyCloudBackup: async () => undefined }))
vi.mock('./deviceAccountState', () => ({ isDeviceAccountDeleted: async () => false }))

import {
  hasEncryptionPasswordSetup,
  verifyEncryptionPassword,
  setupEncryptionPassword,
  syncMerge,
} from './cloudBackupService'
import { BACKUP_ACCESS_DENIED_MESSAGE, BACKUP_UNREACHABLE_MESSAGE } from './syncErrorClassifier'

const fbError = (code: string) => Object.assign(new Error(code), { code })

beforeEach(() => {
  storage.getMetadata.mockReset()
  storage.getBytes.mockReset()
  storage.uploadString.mockClear()
  verifyPasswordWithToken.mockReset()
  verifyPasswordWithToken.mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('hasEncryptionPasswordSetup', () => {
  it('object-not-found -> absent', async () => {
    storage.getMetadata.mockRejectedValue(fbError('storage/object-not-found'))
    expect(await hasEncryptionPasswordSetup()).toEqual({ state: 'absent' })
  })

  it('verify.enc exists -> present', async () => {
    storage.getMetadata.mockResolvedValue({ generation: '1' })
    expect(await hasEncryptionPasswordSetup()).toEqual({ state: 'present' })
  })

  it('unauthorized (403) -> error with the access message', async () => {
    storage.getMetadata.mockRejectedValue(fbError('storage/unauthorized'))
    expect(await hasEncryptionPasswordSetup()).toEqual({
      state: 'error', error: BACKUP_ACCESS_DENIED_MESSAGE, errorCode: 'permission-denied',
    })
  })

  it('network failure -> error, not absent', async () => {
    storage.getMetadata.mockRejectedValue(fbError('storage/retry-limit-exceeded'))
    expect(await hasEncryptionPasswordSetup()).toMatchObject({ state: 'error', error: BACKUP_UNREACHABLE_MESSAGE })
  })
})

describe('setupEncryptionPassword never overwrites verify.enc it could not read', () => {
  it('unauthorized -> refuses with the access message, writes nothing', async () => {
    storage.getMetadata.mockRejectedValue(fbError('storage/unauthorized'))
    expect(await setupEncryptionPassword('password1')).toEqual({
      success: false, error: BACKUP_ACCESS_DENIED_MESSAGE, errorCode: 'permission-denied',
    })
    expect(storage.uploadString).not.toHaveBeenCalled()
  })

  it('present -> refuses, writes nothing', async () => {
    storage.getMetadata.mockResolvedValue({ generation: '1' })
    expect(await setupEncryptionPassword('password1')).toMatchObject({ success: false, errorCode: 'password-exists' })
    expect(storage.uploadString).not.toHaveBeenCalled()
  })

  it('absent -> writes the verification token', async () => {
    storage.getMetadata.mockRejectedValue(fbError('storage/object-not-found'))
    expect(await setupEncryptionPassword('password1')).toEqual({ success: true })
    expect(storage.uploadString).toHaveBeenCalledTimes(1)
  })
})

describe('verifyEncryptionPassword', () => {
  it('token read, password does not match -> wrong-password', async () => {
    storage.getBytes.mockResolvedValue(new TextEncoder().encode('token').buffer)
    verifyPasswordWithToken.mockResolvedValue(false)
    expect(await verifyEncryptionPassword('pw')).toEqual({ status: 'wrong-password' })
  })

  it('token read, password matches -> valid', async () => {
    storage.getBytes.mockResolvedValue(new TextEncoder().encode('token').buffer)
    expect(await verifyEncryptionPassword('pw')).toEqual({ status: 'valid' })
  })

  it('getBytes 403 -> read-failed with the access message, not wrong password', async () => {
    storage.getBytes.mockRejectedValue(fbError('storage/unauthorized'))
    expect(await verifyEncryptionPassword('pw')).toEqual({
      status: 'read-failed', error: BACKUP_ACCESS_DENIED_MESSAGE, errorCode: 'permission-denied',
    })
    expect(verifyPasswordWithToken).not.toHaveBeenCalled()
  })
})

describe('syncMerge error messages', () => {
  it('verify read 403 -> access message, not wrong password', async () => {
    storage.getBytes.mockRejectedValue(fbError('storage/unauthorized'))
    const res = await syncMerge('pw')
    expect(res).toEqual({ success: false, error: BACKUP_ACCESS_DENIED_MESSAGE, errorCode: 'permission-denied' })
  })

  it('upload 403 -> access message, never "re-login"', async () => {
    storage.getBytes.mockResolvedValue(new TextEncoder().encode('token').buffer)
    storage.getMetadata.mockRejectedValue(fbError('storage/object-not-found')) // no cloud backup yet
    storage.uploadString.mockRejectedValueOnce(fbError('storage/unauthorized'))
    const res = await syncMerge('pw')
    expect(res).toMatchObject({ success: false, error: BACKUP_ACCESS_DENIED_MESSAGE, errorCode: 'permission-denied' })
    expect(res.error).not.toContain('התחבר מחדש')
  })

  it('expired login (storage/unauthenticated) -> re-login message', async () => {
    storage.getBytes.mockResolvedValue(new TextEncoder().encode('token').buffer)
    storage.getMetadata.mockRejectedValue(fbError('storage/object-not-found'))
    storage.uploadString.mockRejectedValueOnce(fbError('storage/unauthenticated'))
    const res = await syncMerge('pw')
    expect(res).toMatchObject({ success: false, errorCode: 'not-authenticated' })
    expect(res.error).toContain('התחבר מחדש')
  })
})
