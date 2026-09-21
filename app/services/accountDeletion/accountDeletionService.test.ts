import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// A small in-memory Firestore: documents live in one Map keyed by full path.
// Just enough surface for the delete job — get/set/delete, where(==)+limit,
// batch, getAll, recursiveDelete.
// ---------------------------------------------------------------------------
type Data = Record<string, unknown>

class FakeFirestore {
  docs = new Map<string, Data>()

  seed(path: string, data: Data = {}) {
    this.docs.set(path, data)
  }

  has(path: string) {
    return this.docs.has(path)
  }

  collection(path: string): FakeCollection {
    return new FakeCollection(this, path)
  }

  batch() {
    const ops: Array<() => void> = []
    return {
      delete: (ref: FakeDoc) => void ops.push(() => this.docs.delete(ref.path)),
      commit: async () => void ops.forEach((op) => op()),
    }
  }

  async getAll(...refs: FakeDoc[]) {
    return Promise.all(refs.map((ref) => ref.get()))
  }

  async recursiveDelete(ref: FakeDoc) {
    for (const key of [...this.docs.keys()]) {
      if (key === ref.path || key.startsWith(`${ref.path}/`)) this.docs.delete(key)
    }
  }
}

class FakeDoc {
  constructor(private fs: FakeFirestore, public path: string) {}
  get id() {
    return this.path.split('/').pop() as string
  }
  get ref() {
    return this
  }
  async get() {
    const data = this.fs.docs.get(this.path)
    return { exists: data !== undefined, id: this.id, ref: this, data: () => data }
  }
  async set(data: Data) {
    this.fs.docs.set(this.path, data)
  }
  async delete() {
    this.fs.docs.delete(this.path)
  }
  collection(name: string) {
    return new FakeCollection(this.fs, `${this.path}/${name}`)
  }
}

class FakeCollection {
  constructor(private fs: FakeFirestore, private path: string, private filters: Array<[string, unknown]> = [], private max = Infinity) {}
  doc(id: string) {
    return new FakeDoc(this.fs, `${this.path}/${id}`)
  }
  where(field: string, _op: '==', value: unknown) {
    return new FakeCollection(this.fs, this.path, [...this.filters, [field, value]], this.max)
  }
  limit(n: number) {
    return new FakeCollection(this.fs, this.path, this.filters, n)
  }
  async get() {
    const prefix = `${this.path}/`
    const docs = [...this.fs.docs.entries()]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .filter(([, data]) => this.filters.every(([field, value]) => data[field] === value))
      .slice(0, this.max)
      .map(([key, data]) => ({ id: key.split('/').pop() as string, ref: new FakeDoc(this.fs, key), data: () => data }))
    return { empty: docs.length === 0, docs }
  }
}

let fake: FakeFirestore
vi.mock('@/app/lib/firebaseAdmin', () => ({ getAdminFirestore: () => fake }))

import {
  DeletionStepError,
  resolveSubject,
  runAccountDeletion,
  type DeletionDeps,
  type DeletionPlan,
} from './accountDeletionService'
import { findAccountMarker } from '@/app/lib/accountMarker'

const NOW = new Date('2026-09-21T12:00:00.000Z')

function makeDeps(overrides: Partial<DeletionDeps> = {}) {
  const calls = { storage: [] as string[], authDeleted: [] as string[], claimsSet: [] as Array<[string, unknown]> }
  const claims = new Map<string, Record<string, unknown>>()
  const emails: Record<string, string> = { owner1: 'Owner@Example.com', member1: 'member@example.com', solo1: 'solo@example.com' }
  const deps: DeletionDeps = {
    firestore: fake as never,
    variant: 'aglamazo',
    now: () => NOW,
    deleteStoragePrefix: async (prefix) => void calls.storage.push(prefix),
    getAuthEmail: async (uid) => emails[uid] ?? null,
    deleteAuthUser: async (uid) => void calls.authDeleted.push(uid),
    getClaims: async (uid) => claims.get(uid) ?? null,
    setClaims: async (uid, value) => {
      claims.set(uid, { ...(claims.get(uid) ?? {}), ...value })
      calls.claimsSet.push([uid, value])
    },
    ...overrides,
  }
  return { deps, calls, claims }
}

function seedHousehold() {
  fake.seed('households/hh1', { ownerId: 'owner1', members: ['owner1', 'member1'] })
  fake.seed('users/owner1', { householdId: 'hh1', householdRole: 'owner', tier: 'home' })
  fake.seed('users/owner1/private/x', { secret: true })
  fake.seed('users/member1', { householdId: 'hh1', householdRole: 'member' })
  fake.seed('groceries/owner1', {})
  fake.seed('groceries/owner1/stores/shufersal/private/credentials', { token: 't' })
  fake.seed('groceries/member1', {})
  fake.seed('userTasks/owner1/items/i1', {})
  fake.seed('billingStatus/owner1', { tier: 'home' })
  fake.seed('appChatHistory/owner1', {})
  fake.seed('telegramChatHistory/member1', {})
  fake.seed('telegramLinks/1_2', { uid: 'owner1' })
  fake.seed('telegramLinkCodes/ABC123', { uid: 'member1' })
  fake.seed('chatQueue/q1', { uid: 'owner1' })
  fake.seed('ypayPaymentLinks/cid1', { ownerUserId: 'owner1' })
  fake.seed('ypayPaymentLinks/cid2', { billingOwnerId: 'owner1' })
  fake.seed('upayPaymentLinks/cid2', { billingOwnerId: 'owner1' })
  fake.seed('ypayPaymentEvents/e1', { chargeIdentifier: 'cid1' })
  fake.seed('ypayPaymentEvents/e2', { chargeIdentifier: 'cid2' })
  fake.seed('upayPaymentEvents/e3', { chargeIdentifier: 'cid2' })
  fake.seed('invitations/inv1', { householdId: 'hh1', inviterUid: 'owner1', inviteeEmail: 'x@example.com' })
  fake.seed('invitations/inv2', { householdId: 'other', inviterUid: 'stranger', inviteeEmail: 'member@example.com' })
  fake.seed('businessPartners/bp1', { ownerUid: 'owner1', businessSyncId: 'biz1', email: 'partner@example.com' })
  fake.seed('businessAccessGrants/g1', { ownerUid: 'owner1', uid: 'partner1', businessSyncId: 'biz1' })
  fake.seed('businessAccessGrants/g2', { ownerUid: 'stranger', uid: 'member1', businessSyncId: 'bizX' })
  fake.seed('businessShareInvitations/si1', { ownerUid: 'owner1', businessSyncId: 'biz1', inviteeEmail: 'partner@example.com' })
  fake.seed('provisions/owner@example.com', { claimedBy: 'owner1', tier: 'home' })
  // Someone else's data — must survive.
  fake.seed('users/stranger', {})
  fake.seed('groceries/stranger', {})
  fake.seed('ypayPaymentLinks/cidS', { ownerUserId: 'stranger' })
  fake.seed('ypayPaymentEvents/eS', { chargeIdentifier: 'cidS' })
  fake.seed('invitations/invS', { householdId: 'other', inviterUid: 'stranger', inviteeEmail: 's@example.com' })
}

beforeEach(() => {
  fake = new FakeFirestore()
})

async function planFor(deps: DeletionDeps, uid: string, householdId?: string): Promise<DeletionPlan> {
  const subject = await resolveSubject(deps, uid, householdId)
  if (!subject.ok) throw new Error(`refused: ${subject.code}`)
  return subject.plan
}

describe('resolveSubject', () => {
  it('lets the household owner delete, members first and the owner last', async () => {
    seedHousehold()
    const { deps } = makeDeps()
    const plan = await planFor(deps, 'owner1', 'hh1')
    expect(plan).toMatchObject({ kind: 'household', subjectId: 'hh1', ownerUid: 'owner1', uids: ['member1', 'owner1'] })
    expect(plan.businessSyncIds).toEqual(['biz1'])
    expect(plan.emails.sort()).toEqual(['member@example.com', 'owner@example.com'])
  })

  it('refuses a non-owner member', async () => {
    seedHousehold()
    const { deps } = makeDeps()
    expect(await resolveSubject(deps, 'member1', 'hh1')).toEqual({ ok: false, code: 'not-owner' })
  })

  it('refuses a member using only the household id from their user doc (no claim)', async () => {
    seedHousehold()
    const { deps } = makeDeps()
    expect(await resolveSubject(deps, 'member1', undefined)).toEqual({ ok: false, code: 'not-owner' })
  })

  it('treats a user with no household as the owner of their own account', async () => {
    fake.seed('users/solo1', {})
    const { deps } = makeDeps()
    const plan = await planFor(deps, 'solo1', undefined)
    expect(plan).toMatchObject({ kind: 'user', subjectId: 'solo1', ownerUid: 'solo1', uids: ['solo1'] })
  })

  it('treats a stale claim for a dissolved household as a solo account', async () => {
    fake.seed('users/solo1', {})
    const { deps } = makeDeps()
    expect((await planFor(deps, 'solo1', 'gone-household')).kind).toBe('user')
  })
})

describe('runAccountDeletion', () => {
  it('deletes everything the household owns, and nothing else', async () => {
    seedHousehold()
    const { deps, calls } = makeDeps()
    const completed = await runAccountDeletion(deps, await planFor(deps, 'owner1', 'hh1'))

    expect(completed).toEqual(['plan', 'marker', 'storage', 'claims', 'firestore', 'auth', 'finalize'])
    for (const gone of [
      'households/hh1', 'users/owner1', 'users/owner1/private/x', 'users/member1',
      'groceries/owner1', 'groceries/owner1/stores/shufersal/private/credentials', 'groceries/member1',
      'userTasks/owner1/items/i1', 'billingStatus/owner1', 'appChatHistory/owner1', 'telegramChatHistory/member1',
      'telegramLinks/1_2', 'telegramLinkCodes/ABC123', 'chatQueue/q1',
      'ypayPaymentLinks/cid1', 'ypayPaymentLinks/cid2', 'upayPaymentLinks/cid2',
      'ypayPaymentEvents/e1', 'ypayPaymentEvents/e2', 'upayPaymentEvents/e3',
      'invitations/inv1', 'invitations/inv2', 'businessPartners/bp1', 'businessAccessGrants/g1',
      'businessAccessGrants/g2', 'businessShareInvitations/si1', 'provisions/owner@example.com',
    ]) {
      expect(fake.has(gone), `${gone} should be deleted`).toBe(false)
    }
    for (const kept of [
      'users/stranger', 'groceries/stranger', 'ypayPaymentLinks/cidS', 'ypayPaymentEvents/eS', 'invitations/invS',
    ]) {
      expect(fake.has(kept), `${kept} must survive`).toBe(true)
    }

    expect(calls.storage.sort()).toEqual([
      'backups/aglamazo/hh1/'.replace('hh1', 'households/hh1'),
      'backups/aglamazo/member1/',
      'backups/aglamazo/owner1/',
      'backups/aglamazo/shared/biz1/',
    ].sort())
    expect(calls.authDeleted).toEqual(['member1', 'owner1'])

    expect(fake.has('accountDeletionJobs/household_hh1')).toBe(false)
    const audit = [...fake.docs.keys()].filter((k) => k.startsWith('accountDeletionAudit/'))
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(fake.docs.get(audit[0]))).not.toContain('hh1')
  })

  it('writes the markers before it deletes anything', async () => {
    seedHousehold()
    const seenAtFirstDelete: string[] = []
    const { deps } = makeDeps({
      deleteStoragePrefix: async () => {
        if (seenAtFirstDelete.length === 0) {
          seenAtFirstDelete.push(...[...fake.docs.keys()].filter((k) => k.startsWith('deletedAccounts/')))
          expect(fake.has('users/owner1')).toBe(true)
        }
      },
    })
    await runAccountDeletion(deps, await planFor(deps, 'owner1', 'hh1'))
    expect(seenAtFirstDelete.sort()).toEqual([
      'deletedAccounts/business_biz1', 'deletedAccounts/household_hh1',
      'deletedAccounts/user_member1', 'deletedAccounts/user_owner1',
    ])
    const marker = fake.docs.get('deletedAccounts/household_hh1') as Record<string, unknown>
    expect(Object.keys(marker).sort()).toEqual(['deletedAt', 'id', 'kind', 'purgeAfter', 'variant'])
    expect((marker.purgeAfter as Date).getTime() - NOW.getTime()).toBe(90 * 24 * 60 * 60 * 1000)
  })

  it('takes the partner off the deleted business claim, and only that', async () => {
    seedHousehold()
    const { deps, calls, claims } = makeDeps()
    claims.set('partner1', { sharedBusinesses: ['biz1', 'keep-me'], other: 'x' })
    await runAccountDeletion(deps, await planFor(deps, 'owner1', 'hh1'))
    expect(calls.claimsSet).toEqual([['partner1', { sharedBusinesses: ['keep-me'] }]])
    expect(claims.get('partner1')).toEqual({ sharedBusinesses: ['keep-me'], other: 'x' })
  })

  it('reports the failing step and leaves the owner able to retry (Auth is last)', async () => {
    seedHousehold()
    let failStorage = true
    const { deps, calls } = makeDeps({
      deleteStoragePrefix: async (prefix) => {
        if (failStorage && prefix.includes('member1')) throw new Error('storage unavailable')
      },
    })
    const plan = await planFor(deps, 'owner1', 'hh1')
    await expect(runAccountDeletion(deps, plan)).rejects.toMatchObject({ name: 'DeletionStepError', step: 'storage' })
    expect(calls.authDeleted).toEqual([])
    expect(fake.has('users/owner1')).toBe(true)
    expect(fake.has('deletedAccounts/household_hh1')).toBe(true)

    failStorage = false
    const resumed = await resolveSubject(deps, 'owner1', 'hh1')
    expect(resumed).toMatchObject({ ok: true, resumed: true })
    if (!resumed.ok) throw new Error('unreachable')
    await runAccountDeletion(deps, resumed.plan)
    expect(fake.has('users/owner1')).toBe(false)
    expect(calls.authDeleted).toEqual(['member1', 'owner1'])
  })

  it('still finds the members after the household doc is gone (failure at the Auth step)', async () => {
    seedHousehold()
    let failMember = true
    const { deps, calls } = makeDeps({
      deleteAuthUser: async (uid) => {
        if (failMember && uid === 'member1') throw new Error('auth unavailable')
        calls.authDeleted.push(uid)
      },
    })
    await expect(runAccountDeletion(deps, await planFor(deps, 'owner1', 'hh1'))).rejects.toBeInstanceOf(DeletionStepError)
    expect(fake.has('households/hh1')).toBe(false) // the data the plan came from is already gone

    failMember = false
    const resumed = await resolveSubject(deps, 'owner1', 'hh1')
    if (!resumed.ok) throw new Error('unreachable')
    expect(resumed.plan.uids).toEqual(['member1', 'owner1'])
    await runAccountDeletion(deps, resumed.plan)
    expect(calls.authDeleted).toEqual(['member1', 'owner1'])
  })

  it('does not let a member resume the owner\'s half-finished run', async () => {
    seedHousehold()
    const { deps } = makeDeps({ deleteAuthUser: async () => { throw new Error('boom') } })
    await expect(runAccountDeletion(deps, await planFor(deps, 'owner1', 'hh1'))).rejects.toBeInstanceOf(DeletionStepError)
    expect(await resolveSubject(deps, 'member1', 'hh1')).toEqual({ ok: false, code: 'not-owner' })
  })

  it('deletes a solo account with its personal backup prefix and no household', async () => {
    fake.seed('users/solo1', {})
    fake.seed('groceries/solo1', {})
    const { deps, calls } = makeDeps()
    await runAccountDeletion(deps, await planFor(deps, 'solo1', undefined))
    expect(calls.storage).toEqual(['backups/aglamazo/solo1/'])
    expect(calls.authDeleted).toEqual(['solo1'])
    expect(fake.has('deletedAccounts/user_solo1')).toBe(true)
    expect(fake.has('deletedAccounts/household_solo1')).toBe(false)
    expect(fake.has('users/solo1')).toBe(false)
  })

  it('is safe to run twice on a finished account', async () => {
    fake.seed('users/solo1', {})
    const { deps } = makeDeps()
    const plan = await planFor(deps, 'solo1', undefined)
    await runAccountDeletion(deps, plan)
    await expect(runAccountDeletion(deps, plan)).resolves.toBeDefined()
  })
})

describe('findAccountMarker', () => {
  it('sees a deleted uid or household, and reports the time', async () => {
    fake.seed('deletedAccounts/user_u1', { deletedAt: NOW.toISOString() })
    fake.seed('deletedAccounts/household_h1', { deletedAt: NOW.toISOString() })
    expect(await findAccountMarker({ uid: 'u1' })).toEqual({ deleted: true, deletedAt: NOW.toISOString() })
    expect(await findAccountMarker({ uid: 'other', householdId: 'h1' })).toMatchObject({ deleted: true })
    expect(await findAccountMarker({ uid: 'other', householdId: 'h2' })).toEqual({ deleted: false })
  })

  it('answers "not deleted" for ids that cannot be a marker key instead of building a path from them', async () => {
    expect(await findAccountMarker({ uid: '../users/x' })).toEqual({ deleted: false })
    expect(await findAccountMarker({})).toEqual({ deleted: false })
  })
})
