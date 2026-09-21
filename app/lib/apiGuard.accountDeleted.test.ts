import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verifyIdToken, findAccountMarker } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findAccountMarker: vi.fn(),
}))

vi.mock('@/app/lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  verifyIdToken,
  getAdminFirestore: () => ({
    collection: (name: string) => ({
      doc: () => ({ get: async () => ({ data: () => ({ tier: 'home', tcAcceptedAt: '9999' }) }) }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
      _name: name,
    }),
  }),
}))
vi.mock('@/app/lib/accountMarker', () => ({ findAccountMarker }))

import { NextRequest } from 'next/server'
import { requireAuth, requireTc } from './apiGuard'

const request = () => new NextRequest('http://localhost:3100/api/x', { headers: { Authorization: 'Bearer token' } })

beforeEach(() => {
  vi.resetAllMocks()
  verifyIdToken.mockResolvedValue({ uid: 'u1', householdId: 'h1', auth_time: 1234 })
})

describe('apiGuard and account-deleted markers (aglamazo#411)', () => {
  it('asks the marker for both the uid and the household in the token', async () => {
    findAccountMarker.mockResolvedValue({ deleted: false })
    await requireAuth(request())
    expect(findAccountMarker).toHaveBeenCalledWith({ uid: 'u1', householdId: 'h1' })
  })

  it('refuses every guard once the account has a marker, even with a valid token', async () => {
    findAccountMarker.mockResolvedValue({ deleted: true, deletedAt: 'x' })
    for (const guard of [requireAuth, requireTc]) {
      const result = await guard(request())
      expect(result.error?.status).toBe(403)
      expect(await result.error?.json()).toMatchObject({ code: 'account-deleted' })
    }
  })

  it('lets the delete route through, and exposes when the user last signed in', async () => {
    findAccountMarker.mockResolvedValue({ deleted: true, deletedAt: 'x' })
    const result = await requireAuth(request(), { allowDeletedAccount: true })
    expect(result.error).toBeUndefined()
    expect(result.authTime).toBe(1234)
    expect(findAccountMarker).not.toHaveBeenCalled()
  })

  it('fails closed — not open — when the marker lookup itself breaks', async () => {
    findAccountMarker.mockRejectedValue(new Error('firestore down'))
    const result = await requireAuth(request())
    expect(result.error).toBeDefined()
    expect(result.uid).toBeUndefined()
  })
})
