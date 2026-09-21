import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { pingDeadman, getAdminFirestore } = vi.hoisted(() => ({
  pingDeadman: vi.fn(async () => ({ sent: true })),
  getAdminFirestore: vi.fn(),
}))

vi.mock('agents-observe', () => ({ pingDeadman }))
vi.mock('agents-observe/next', () => ({
  withServiceCall: (handler: unknown) => handler,
}))
vi.mock('@/app/lib/firebaseAdmin', () => ({ getAdminFirestore }))
vi.mock('@/app/services/grocery/initStores', () => ({ initStores: vi.fn() }))

import { NextRequest } from 'next/server'
import { GET } from './route'

const request = () => new NextRequest('http://localhost:3100/api/grocery/cron')
const callGet = () => (GET as unknown as (req: NextRequest) => Promise<Response>)(request())

describe('grocery cron dead-man ping (aglamazo#409)', () => {
  beforeEach(() => {
    process.env.DEADMAN_SLUG_GROCERY_CRON = 'test-slug-not-a-real-one'
    pingDeadman.mockClear()
    getAdminFirestore.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.GROCERY_CRON_ENABLED
    delete process.env.DEADMAN_SLUG_GROCERY_CRON
  })

  it('pings once, awaited, after a run that reaches the end', async () => {
    getAdminFirestore.mockReturnValue({
      collection: () => ({ get: async () => ({ docs: [] }) }),
    })
    const res = await callGet()
    expect(res.status).toBe(200)
    expect(pingDeadman).toHaveBeenCalledTimes(1)
    expect(pingDeadman).toHaveBeenCalledWith('test-slug-not-a-real-one', { await: true })
  })

  it('still pings when grocery automation is disabled for this deployment', async () => {
    process.env.GROCERY_CRON_ENABLED = 'false'
    const res = await callGet()
    expect(await res.json()).toMatchObject({ ok: true, skipped: 'GROCERY_CRON_ENABLED=false' })
    expect(pingDeadman).toHaveBeenCalledTimes(1)
    expect(getAdminFirestore).not.toHaveBeenCalled()
  })

  it('skips the ping, and still completes the run, when the slug is not configured', async () => {
    delete process.env.DEADMAN_SLUG_GROCERY_CRON
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getAdminFirestore.mockReturnValue({ collection: () => ({ get: async () => ({ docs: [] }) }) })
    const res = await callGet()
    expect(res.status).toBe(200)
    expect(pingDeadman).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DEADMAN_SLUG_GROCERY_CRON is not set'))
  })

  it('sends nothing when the route dies before the end — the missing ping is the alert', async () => {
    getAdminFirestore.mockImplementation(() => {
      throw new Error('firestore unreachable')
    })
    await expect(callGet()).rejects.toThrow('firestore unreachable')
    expect(pingDeadman).not.toHaveBeenCalled()
  })
})
