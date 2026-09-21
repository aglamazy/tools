import { describe, expect, it, vi } from 'vitest'
import { checkAccountDeleted } from './accountStatusService'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const noSleep = async () => {}

describe('checkAccountDeleted', () => {
  it('reports deleted with the time, and active', async () => {
    const deleted = vi.fn(async () => json({ deleted: true, deletedAt: '2026-09-21T10:00:00.000Z' }))
    expect(await checkAccountDeleted({ uid: 'u1' }, { fetchImpl: deleted, sleep: noSleep }))
      .toEqual({ status: 'deleted', deletedAt: '2026-09-21T10:00:00.000Z' })
    const active = vi.fn(async () => json({ deleted: false }))
    expect(await checkAccountDeleted({ uid: 'u1' }, { fetchImpl: active, sleep: noSleep })).toEqual({ status: 'active' })
  })

  it('sends the ids it was given and never a stale cache', async () => {
    const fetchImpl = vi.fn(async () => json({ deleted: false }))
    await checkAccountDeleted({ uid: 'u1', householdId: 'h1' }, { fetchImpl, sleep: noSleep })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/account/status')
    expect(JSON.parse(init.body as string)).toEqual({ uid: 'u1', householdId: 'h1' })
    expect(init.cache).toBe('no-store')
  })

  it('retries a failure and returns what a later attempt says', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(json({ error: 'x' }, 500))
      .mockResolvedValueOnce(json({ deleted: true, deletedAt: 'x' }))
    const sleeps: number[] = []
    const result = await checkAccountDeleted({ uid: 'u1' }, { fetchImpl, sleep: async (ms) => void sleeps.push(ms) })
    expect(result.status).toBe('deleted')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([1000, 3000])
  })

  it('answers unknown — never active — when the server cannot be reached or misbehaves', async () => {
    const down = vi.fn(async () => { throw new Error('offline') })
    expect(await checkAccountDeleted({ uid: 'u1' }, { fetchImpl: down, sleep: noSleep })).toEqual({ status: 'unknown' })
    expect(down).toHaveBeenCalledTimes(3)
    const garbage = vi.fn(async () => json({ hello: 'world' }))
    expect(await checkAccountDeleted({ uid: 'u1' }, { fetchImpl: garbage, sleep: noSleep })).toEqual({ status: 'unknown' })
    const oneShot = vi.fn(async () => json({}, 503))
    expect(await checkAccountDeleted({ uid: 'u1' }, { fetchImpl: oneShot, attempts: 1, sleep: noSleep })).toEqual({ status: 'unknown' })
    expect(oneShot).toHaveBeenCalledTimes(1)
  })

  it('does not ask when there is nothing to ask about', async () => {
    const fetchImpl = vi.fn()
    expect(await checkAccountDeleted({}, { fetchImpl, sleep: noSleep })).toEqual({ status: 'unknown' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
