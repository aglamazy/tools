import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

// aglamazo#441: a sandbox document is a test document — YPAY must never email
// it to the real contact on it. `fetch` is stubbed; nothing leaves the test.

const fetchMock = vi.fn()

const ypayBody = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body)

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/ypay', { method: 'POST', body: JSON.stringify(body) }))

const docRequest = { action: 'createDocument', clientId: 'cid', clientSecret: 'secret', docType: 104, items: [{ description: 'x', quantity: 1, price: 100 }], contact: { email: 'parent@example.com', name: 'הורה' } }
const payRequest = { action: 'createPayment', clientId: 'cid', clientSecret: 'secret', chargeIdentifier: 'c1', items: [{ description: 'x', quantity: 1, price: 100, vatIncluded: false }], contact: { email: 'parent@example.com', name: 'הורה' }, mail: true }

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => url.endsWith('/accessToken')
      ? { access_token: 'tok' }
      : { url: 'https://ypay.test/doc', serialNumber: '1', responseCode: 0 },
    text: async () => '',
  }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('/api/ypay — sandbox never emails the customer (aglamazo#441)', () => {
  it('sandbox createDocument sends mail:false', async () => {
    await post({ ...docRequest, sandbox: true })
    expect(ypayBody(1).mail).toBe(false)
  })

  it('production createDocument leaves mail unset (unchanged)', async () => {
    await post(docRequest)
    expect('mail' in ypayBody(1)).toBe(false)
  })

  it('sandbox createPayment overrides the caller\'s mail:true with false', async () => {
    await post({ ...payRequest, sandbox: true })
    expect(ypayBody(1).mail).toBe(false)
  })

  it('production createPayment keeps the caller\'s mail:true', async () => {
    await post(payRequest)
    expect(ypayBody(1).mail).toBe(true)
  })
})
