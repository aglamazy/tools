import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAuth, resolveSubject, runAccountDeletion, findAccountMarker } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveSubject: vi.fn(),
  runAccountDeletion: vi.fn(),
  findAccountMarker: vi.fn(),
}))

vi.mock('@/app/lib/apiGuard', () => ({ requireAuth }))
vi.mock('@/app/lib/firebaseAdmin', () => ({ isAdminConfigured: () => true }))
vi.mock('@/app/services/accountDeletion/adminDeps', () => ({ createAdminDeletionDeps: () => ({}) }))
vi.mock('@/app/services/accountDeletion/accountDeletionService', () => {
  class DeletionStepError extends Error {
    constructor(public step: string, public cause: unknown) {
      super(`failed at ${step}`)
    }
  }
  return { DeletionStepError, resolveSubject, runAccountDeletion }
})
vi.mock('@/app/lib/accountMarker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/lib/accountMarker')>()),
  findAccountMarker,
}))

import { NextRequest } from 'next/server'
import { DeletionStepError } from '@/app/services/accountDeletion/accountDeletionService'
import { POST as deleteAccount } from './delete/route'
import { POST as accountStatus } from './status/route'

const post = (url: string, body: unknown = {}) =>
  new NextRequest(`http://localhost:3100${url}`, { method: 'POST', body: JSON.stringify(body) })

const nowSeconds = () => Math.floor(Date.now() / 1000)
const signedIn = (authTime = nowSeconds()) =>
  requireAuth.mockResolvedValue({ uid: 'owner1', claims: { householdId: 'hh1' }, authTime })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/account/delete', () => {
  it('lets a re-run through for an account that already has a marker', async () => {
    signedIn()
    resolveSubject.mockResolvedValue({ ok: true, resumed: false, plan: { kind: 'user', uids: ['owner1'] } })
    await deleteAccount(post('/api/account/delete'))
    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), { allowDeletedAccount: true })
  })

  it('refuses without a fresh sign-in, before touching anything', async () => {
    signedIn(nowSeconds() - 10 * 60)
    const res = await deleteAccount(post('/api/account/delete'))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ success: false, errorCode: 'reauth-required' })
    expect(resolveSubject).not.toHaveBeenCalled()
    expect(runAccountDeletion).not.toHaveBeenCalled()
  })

  it('refuses a household member who is not the owner', async () => {
    signedIn()
    resolveSubject.mockResolvedValue({ ok: false, code: 'not-owner' })
    const res = await deleteAccount(post('/api/account/delete'))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ errorCode: 'not-owner' })
    expect(runAccountDeletion).not.toHaveBeenCalled()
  })

  it('passes an unauthenticated request through unchanged', async () => {
    const denied = new Response(JSON.stringify({ success: false }), { status: 401 })
    requireAuth.mockResolvedValue({ error: denied })
    expect((await deleteAccount(post('/api/account/delete'))).status).toBe(401)
    expect(runAccountDeletion).not.toHaveBeenCalled()
  })

  it('reports success only after every step completed', async () => {
    signedIn()
    resolveSubject.mockResolvedValue({ ok: true, resumed: true, plan: { kind: 'household', uids: ['m', 'owner1'] } })
    runAccountDeletion.mockResolvedValue(['finalize'])
    const res = await deleteAccount(post('/api/account/delete'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, kind: 'household', accountsDeleted: 2, resumed: true })
  })

  it('answers 500 naming the step when the job fails midway, and says it is retryable', async () => {
    signedIn()
    resolveSubject.mockResolvedValue({ ok: true, resumed: false, plan: { kind: 'user', uids: ['owner1'] } })
    runAccountDeletion.mockRejectedValue(new DeletionStepError('storage', new Error('down')))
    const res = await deleteAccount(post('/api/account/delete'))
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ success: false, errorCode: 'deletion-failed', step: 'storage', retryable: true })
  })
})

describe('POST /api/account/status', () => {
  it('reports a deleted account without needing a login', async () => {
    findAccountMarker.mockResolvedValue({ deleted: true, deletedAt: '2026-09-21T12:00:00.000Z' })
    const res = await accountStatus(post('/api/account/status', { uid: 'u1', householdId: 'h1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ deleted: true, deletedAt: '2026-09-21T12:00:00.000Z' })
    expect(findAccountMarker).toHaveBeenCalledWith({ uid: 'u1', householdId: 'h1' })
  })

  it('reports not deleted', async () => {
    findAccountMarker.mockResolvedValue({ deleted: false })
    expect(await (await accountStatus(post('/api/account/status', { uid: 'u1' }))).json()).toEqual({ deleted: false })
  })

  it.each([
    ['no ids', {}],
    ['a path-like uid', { uid: '../users/x' }],
    ['a non-string household', { householdId: 42 }],
  ])('rejects %s with 400 and never looks anything up', async (_label, body) => {
    const res = await accountStatus(post('/api/account/status', body))
    expect(res.status).toBe(400)
    expect(findAccountMarker).not.toHaveBeenCalled()
  })

  it('answers 500, not "not deleted", when the lookup itself fails', async () => {
    findAccountMarker.mockRejectedValue(new Error('firestore down'))
    expect((await accountStatus(post('/api/account/status', { uid: 'u1' }))).status).toBe(500)
  })
})
