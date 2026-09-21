import { beforeEach, describe, expect, it, vi } from 'vitest'

const { currentUser, checkAccountDeleted, wipe } = vi.hoisted(() => ({
  currentUser: { value: null as null | { uid: string; getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }> } },
  checkAccountDeleted: vi.fn(),
  wipe: vi.fn(),
}))

vi.mock('@/app/lib/firebase', () => ({
  isFirebaseConfigured: () => true,
  getFirebaseAuth: () => ({ get currentUser() { return currentUser.value } }),
}))
vi.mock('./accountStatusService', () => ({ checkAccountDeleted }))
vi.mock('./clearLocalUserState', async () => {
  const { db } = await import('@/app/db/financeDB')
  return {
    clearLocalUserState: async () => {
      wipe()
      await Promise.all(db.tables.map((table) => table.clear()))
    },
  }
})

import { db } from '@/app/db/financeDB'
import {
  getDeviceAccountState,
  markDeviceAccountDeleted,
  rememberAccountRefs,
} from './deviceAccountState'
import {
  handleSignOutTransition,
  reconcileStaleSession,
  shouldSyncNow,
  wipeThisDevice,
} from './deviceAccountReconciler'

const REFS = { uid: 'u1', householdId: 'h1' }

async function seedLocalData() {
  await db.appSettings.add({ key: 'someSetting', value: 1 } as never)
}
const localDataKept = async () => (await db.appSettings.count()) > 0

beforeEach(async () => {
  vi.resetAllMocks()
  await Promise.all(db.tables.map((table) => table.clear()))
  currentUser.value = null
})

describe('handleSignOutTransition', () => {
  it('still wipes on a sign-out the user asked for', async () => {
    await seedLocalData()
    expect(await handleSignOutTransition(REFS, true)).toBe('wiped')
    expect(await localDataKept()).toBe(false)
    expect(checkAccountDeleted).not.toHaveBeenCalled()
  })

  it('keeps the local data and remembers the deletion when a forced sign-out was caused by it', async () => {
    await seedLocalData()
    checkAccountDeleted.mockResolvedValue({ status: 'deleted', deletedAt: '2026-09-21T10:00:00.000Z' })
    expect(await handleSignOutTransition(REFS, false)).toBe('kept-deleted')
    expect(await localDataKept()).toBe(true)
    expect((await getDeviceAccountState()).deletedAt).toBe('2026-09-21T10:00:00.000Z')
    expect(checkAccountDeleted).toHaveBeenCalledWith(REFS)
  })

  it('wipes as before when a forced sign-out turns out to be unrelated to a deletion', async () => {
    await seedLocalData()
    checkAccountDeleted.mockResolvedValue({ status: 'active' })
    expect(await handleSignOutTransition(REFS, false)).toBe('wiped')
    expect(await localDataKept()).toBe(false)
  })

  it('does NOT wipe when the server cannot be asked, and asks again at the next load', async () => {
    await seedLocalData()
    checkAccountDeleted.mockResolvedValue({ status: 'unknown' })
    expect(await handleSignOutTransition(REFS, false)).toBe('kept-unverified')
    expect(await localDataKept()).toBe(true)
    expect((await getDeviceAccountState()).pendingSignOutCheck).toBe(true)
  })

  it('keeps everything once the device is already marked deleted, even on a sign-out the user asked for', async () => {
    await seedLocalData()
    await markDeviceAccountDeleted('2026-09-21T10:00:00.000Z')
    expect(await handleSignOutTransition(REFS, true)).toBe('kept-deleted')
    expect(await localDataKept()).toBe(true)
  })

  it('falls back to the remembered account when the in-memory one is gone', async () => {
    await seedLocalData()
    await rememberAccountRefs(REFS)
    checkAccountDeleted.mockResolvedValue({ status: 'deleted', deletedAt: 'x' })
    expect(await handleSignOutTransition(null, false)).toBe('kept-deleted')
    expect(checkAccountDeleted).toHaveBeenCalledWith(REFS)
  })

  it('wipes as it always did when there is no account to ask about', async () => {
    await seedLocalData()
    expect(await handleSignOutTransition(null, false)).toBe('wiped')
    expect(checkAccountDeleted).not.toHaveBeenCalled()
  })
})

describe('reconcileStaleSession (device was offline while the account was deleted)', () => {
  it('marks the device when the remembered account was deleted', async () => {
    await seedLocalData()
    await rememberAccountRefs(REFS)
    checkAccountDeleted.mockResolvedValue({ status: 'deleted', deletedAt: '2026-09-21T10:00:00.000Z' })
    await reconcileStaleSession()
    expect((await getDeviceAccountState()).deletedAt).toBe('2026-09-21T10:00:00.000Z')
    expect(await localDataKept()).toBe(true)
  })

  it('asks nothing of a browser that never signed in', async () => {
    await reconcileStaleSession()
    expect(checkAccountDeleted).not.toHaveBeenCalled()
  })

  it('finishes a wipe that an earlier unverifiable forced sign-out deferred', async () => {
    await seedLocalData()
    await rememberAccountRefs(REFS)
    checkAccountDeleted.mockResolvedValueOnce({ status: 'unknown' })
    await handleSignOutTransition(REFS, false)
    expect(await localDataKept()).toBe(true)

    checkAccountDeleted.mockResolvedValueOnce({ status: 'active' })
    await reconcileStaleSession()
    expect(await localDataKept()).toBe(false)
  })

  it('leaves everything alone when it still cannot ask, or the account is active with nothing deferred', async () => {
    await seedLocalData()
    await rememberAccountRefs(REFS)
    checkAccountDeleted.mockResolvedValue({ status: 'unknown' })
    await reconcileStaleSession()
    checkAccountDeleted.mockResolvedValue({ status: 'active' })
    await reconcileStaleSession()
    expect(await localDataKept()).toBe(true)
    expect((await getDeviceAccountState()).deletedAt).toBeUndefined()
  })
})

describe('shouldSyncNow — the 3 s post-load sync and the 5-minute timer both go through it', () => {
  const signIn = (claims: Record<string, unknown> = { householdId: 'h1' }) => {
    currentUser.value = { uid: 'u1', getIdTokenResult: async () => ({ claims }) }
  }

  it('never syncs on a device marked deleted, and does not even ask the server', async () => {
    signIn()
    await markDeviceAccountDeleted('x')
    expect(await shouldSyncNow()).toBe(false)
    expect(checkAccountDeleted).not.toHaveBeenCalled()
  })

  it('syncs while the account is alive, asking with the uid and household from the token', async () => {
    signIn()
    checkAccountDeleted.mockResolvedValue({ status: 'active' })
    expect(await shouldSyncNow()).toBe(true)
    expect(checkAccountDeleted).toHaveBeenCalledWith(REFS, { attempts: 1 })
  })

  it('stops, and marks the device, the moment the server reports the account deleted (token still valid)', async () => {
    signIn()
    checkAccountDeleted.mockResolvedValue({ status: 'deleted', deletedAt: '2026-09-21T10:00:00.000Z' })
    expect(await shouldSyncNow()).toBe(false)
    expect((await getDeviceAccountState()).deletedAt).toBe('2026-09-21T10:00:00.000Z')
    expect(await shouldSyncNow()).toBe(false)
  })

  it('skips the round when the server cannot be asked — an outage is not "safe to upload"', async () => {
    signIn()
    checkAccountDeleted.mockResolvedValue({ status: 'unknown' })
    expect(await shouldSyncNow()).toBe(false)
  })

  it('has nothing to protect without a Firebase login', async () => {
    expect(await shouldSyncNow()).toBe(true)
    expect(checkAccountDeleted).not.toHaveBeenCalled()
  })
})

describe('wipeThisDevice', () => {
  it('removes the data, the remembered deletion and the login', async () => {
    await seedLocalData()
    await markDeviceAccountDeleted('x')
    const signOut = vi.fn(async () => {})
    await wipeThisDevice(signOut)
    expect(await localDataKept()).toBe(false)
    expect((await getDeviceAccountState()).deletedAt).toBeUndefined()
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
