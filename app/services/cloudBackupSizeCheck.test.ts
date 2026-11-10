import { beforeEach, describe, expect, it, vi } from 'vitest'

// aglamazo#453: the client size check must measure the encrypted UTF-8 bytes
// that uploadString sends (what the Storage rule measures), not the plaintext
// character count — so an oversized backup gets a size message, never a 403.

const storage = {
  getMetadata: vi.fn(),
  getBytes: vi.fn(),
  uploadString: vi.fn(async () => undefined),
}
const encrypt = vi.fn(async (s: string) => s)

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
  encrypt: (...a: unknown[]) => (encrypt as any)(...a),
  decrypt: async (s: string) => s,
  generateVerificationToken: async () => 'token',
  verifyPasswordWithToken: async () => true,
}))
vi.mock('./backupService', () => ({
  isLocalDataEmpty: async () => false,
  exportAllStores: async () => ({ version: 1, stores: {} }),
  importAllStores: async () => undefined,
}))
vi.mock('./applyMergedBackupService', () => ({ applyCloudBackup: async () => undefined }))
vi.mock('./deviceAccountState', () => ({ isDeviceAccountDeleted: async () => false }))

import { uploadBackup, syncMerge } from './cloudBackupService'
import { encodedByteLength, FREE_BACKUP_LIMIT_BYTES } from './backupSizeLimit'

const fbError = (code: string) => Object.assign(new Error(code), { code })

beforeEach(() => {
  storage.getMetadata.mockReset()
  storage.getMetadata.mockRejectedValue(fbError('storage/object-not-found')) // no cloud backup yet
  storage.getBytes.mockReset()
  storage.getBytes.mockResolvedValue(new TextEncoder().encode('token').buffer)
  storage.uploadString.mockClear()
  encrypt.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('encodedByteLength', () => {
  it('counts ASCII as one byte per character', () => {
    expect(encodedByteLength('abc')).toBe(3)
  })

  it('counts Hebrew as UTF-8 bytes, more than the character count', () => {
    const s = 'גיבוי'
    expect(s.length).toBe(5)
    expect(encodedByteLength(s)).toBe(10)
  })
})

const paths: Array<[string, () => Promise<{ success: boolean; errorCode?: string; error?: string }>]> = [
  ['uploadBackup', () => uploadBackup('pw')],
  ['syncMerge', () => syncMerge('pw')],
]

describe.each(paths)('%s size check on the encrypted bytes', (_name, run) => {
  it('plaintext under the limit, encrypted 1 byte over -> size-limit, no upload', async () => {
    encrypt.mockResolvedValue('x'.repeat(FREE_BACKUP_LIMIT_BYTES + 1))
    const res = await run()
    expect(res).toMatchObject({ success: false, errorCode: 'size-limit' })
    expect(res.error).toContain('הגיבוי גדול מדי (2.50 MB)')
    expect(res.error).not.toContain('התחבר מחדש')
    expect(storage.uploadString).not.toHaveBeenCalled()
  })

  it('multi-byte encrypted string over the limit in bytes but not in characters -> size-limit', async () => {
    const s = 'א'.repeat(FREE_BACKUP_LIMIT_BYTES / 2 + 1) // chars under limit, bytes over
    expect(s.length).toBeLessThan(FREE_BACKUP_LIMIT_BYTES)
    encrypt.mockResolvedValue(s)
    const res = await run()
    expect(res).toMatchObject({ success: false, errorCode: 'size-limit' })
    expect(storage.uploadString).not.toHaveBeenCalled()
  })

  it('encrypted exactly at the limit -> uploads', async () => {
    encrypt.mockResolvedValue('x'.repeat(FREE_BACKUP_LIMIT_BYTES))
    storage.getMetadata.mockImplementation(async (r: { fullPath: string }) => {
      if (r.fullPath.endsWith('backup.enc') && storage.uploadString.mock.calls.length > 0) return { generation: '2' }
      throw fbError('storage/object-not-found')
    })
    const res = await run()
    expect(res).toMatchObject({ success: true })
    expect(storage.uploadString).toHaveBeenCalledTimes(1)
  })
})
