import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/lib/firebase', () => ({
  isFirebaseConfigured: () => true,
  getFirebaseAuth: () => ({ currentUser: { uid: 'u1', getIdTokenResult: async () => ({ claims: {} }) } }),
  getFirebaseStorage: () => { throw new Error('storage must not be touched on a deleted device') },
}))
vi.mock('./firebaseAuthService', () => ({
  getCurrentUser: () => ({ uid: 'u1', email: 'a@b.c' }),
  getIdToken: async () => 'token',
}))

import { db } from '@/app/db/financeDB'
import { markDeviceAccountDeleted } from './deviceAccountState'
import { migrateToHouseholdStorage, setupEncryptionPassword, syncMerge, uploadBackup } from './cloudBackupService'
import { setupSharedPassword, syncAllSharedBusinesses, syncSharedBusiness } from './sharedBusinessSyncService'

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('once a device knows its account was deleted, no cloud write can start (aglamazo#413)', () => {
  it('refuses every personal-backup write, including a manual "upload now"', async () => {
    await markDeviceAccountDeleted('2026-09-21T10:00:00.000Z')
    for (const call of [
      () => syncMerge('pw'),
      () => uploadBackup('pw'),
      () => setupEncryptionPassword('pw'),
      () => migrateToHouseholdStorage(),
    ]) {
      expect(await call()).toMatchObject({ success: false, errorCode: 'account-deleted' })
    }
  })

  it('refuses the shared-business sync too, and the loop over them does nothing', async () => {
    await markDeviceAccountDeleted('2026-09-21T10:00:00.000Z')
    expect(await syncSharedBusiness('biz1', 'pw')).toMatchObject({ success: false, errorCode: 'account-deleted' })
    expect(await setupSharedPassword('biz1', 'pw')).toMatchObject({ success: false, errorCode: 'account-deleted' })
    const getPassword = vi.fn()
    await syncAllSharedBusinesses(getPassword)
    expect(getPassword).not.toHaveBeenCalled()
  })
})
