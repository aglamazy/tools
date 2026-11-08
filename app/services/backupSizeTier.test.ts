import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tier claim of the signed-in user; each test sets it.
const claims: Record<string, unknown> = {}
const uploadString = vi.fn(async () => undefined)

vi.mock('@/app/lib/firebase', () => ({
  isFirebaseConfigured: () => true,
  getFirebaseAuth: () => ({ currentUser: { uid: 'u1', getIdTokenResult: async () => ({ claims }) } }),
  getFirebaseStorage: () => ({}),
}))
vi.mock('./firebaseAuthService', () => ({
  getCurrentUser: () => ({ uid: 'u1', email: 'a@b.c' }),
  getIdToken: async () => 'token',
}))
vi.mock('firebase/storage', () => ({
  ref: (_s: unknown, p: string) => ({ fullPath: p }),
  uploadString: (...args: unknown[]) => uploadString(...(args as [])),
  getBytes: async () => new TextEncoder().encode('token').buffer,
  getMetadata: async () => ({ generation: '1' }),
  deleteObject: async () => undefined,
}))
vi.mock('./encryptionService', () => ({
  encrypt: async (s: string) => s,
  decrypt: async (s: string) => s,
  generateVerificationToken: async () => 'token',
  verifyPasswordWithToken: async () => true,
}))

const BIG = 'x'.repeat(3 * 1024 * 1024) // over 2.5 MB

vi.mock('./backupService', async (orig) => ({
  ...(await orig<typeof import('./backupService')>()),
  isLocalDataEmpty: async () => false,
  exportAllStores: async () => ({ version: 1, blob: BIG }),
}))

import { db } from '@/app/db/financeDB'
import { uploadBackup } from './cloudBackupService'
import { resetSharedPassword } from './sharedBusinessSyncService'

function setTier(tier: string | undefined) {
  for (const k of Object.keys(claims)) delete claims[k]
  if (tier) claims.tier = tier
}

beforeEach(async () => {
  uploadString.mockClear()
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('personal/household backup over 2.5 MB (aglamazo#458)', () => {
  it('is refused for tier free', async () => {
    setTier('free')
    const res = await uploadBackup('pw')
    expect(res).toMatchObject({ success: false, errorCode: 'size-limit' })
    expect(res.error).toContain('2.5 MB')
    expect(uploadString).not.toHaveBeenCalled()
  })

  it('is uploaded for tier owner', async () => {
    setTier('owner')
    expect(await uploadBackup('pw')).toMatchObject({ success: true })
    expect(uploadString).toHaveBeenCalledTimes(1)
  })
})

describe('shared business backup over 2.5 MB (aglamazo#458)', () => {
  beforeEach(async () => {
    await db.businesses.add({ syncId: 'biz1', name: 'Biz', type: 'osek_patur', notes: BIG } as never)
  })

  it('is refused for tier free', async () => {
    setTier('free')
    const res = await resetSharedPassword('biz1', 'pw')
    expect(res).toMatchObject({ success: false, errorCode: 'size-limit' })
    // only the verification token was written, not the backup
    expect(uploadString).toHaveBeenCalledTimes(1)
  })

  it('is uploaded for tier owner', async () => {
    setTier('owner')
    expect(await resetSharedPassword('biz1', 'pw')).toMatchObject({ success: true })
    expect(uploadString).toHaveBeenCalledTimes(2)
  })
})
