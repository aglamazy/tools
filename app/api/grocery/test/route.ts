// CALLER-KEYED ROUTE — dev/test harness for the grocery store plugin interface.
/**
 * GET/POST /api/grocery/test — exercise the store plugin directly, without the LLM.
 *
 * Actions:
 *   GET  ?uid&store&action=orders                        → plugin.listOrders
 *   GET  ?uid&store&action=orderItems&orderId            → plugin.readOrderItems
 *   GET  ?uid&store&action=session                       → getAuthenticatedCookies + checkSession (Shufersal only)
 *   POST ?uid&store&action=modifyOrder                   → plugin.modifyOrder(body: OrderModification)
 *   POST ?uid&store&action=addToOrder   body:{orderId,productId,qty}
 *   POST ?uid&store&action=removeFromOrder body:{orderId,entryRef}
 *
 * `store` defaults to 'shufersal'.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { getStore } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'
import { getAuthenticatedCookies, checkSession, cartRead, orderLoadToCart, _debugFetchHtml, preselectSlot } from '@/app/services/grocery/shufersalClient'
import { processChatMessage, handleReset } from '@/app/services/chatBrain'
import { selectProduct } from '@/app/services/chat/pendingSearchService'

export const maxDuration = 60

async function handle(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  initStores()
  const { searchParams } = new URL(request.url)
  // uid defaults to the authenticated user; if explicitly provided it must match
  const uidParam = searchParams.get('uid') || ''
  const uid = uidParam || guard.uid
  if (uidParam && uidParam !== guard.uid) {
    return NextResponse.json({ error: 'Forbidden: uid mismatch' }, { status: 403 })
  }
  const storeId = searchParams.get('store') || 'shufersal'
  const action = searchParams.get('action') || ''

  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 })

  const store = getStore(storeId)
  if (!store) return NextResponse.json({ error: `unknown store: ${storeId}` }, { status: 400 })

  try {
    switch (action) {
      case 'search': {
        const q = searchParams.get('q')
        if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })
        const results = await store.search(uid, q)
        return NextResponse.json({ ok: true, query: q, count: results.length, results: results.slice(0, 10) })
      }
      case 'slots': {
        const days = await store.listSlots(uid)
        return NextResponse.json({ ok: true, days })
      }
      case 'chat': {
        const body = await request.json().catch(() => ({}))
        const { text, reset } = body as { text?: string; reset?: boolean }
        if (reset) {
          await handleReset('testChatHistory', uid)
          return NextResponse.json({ ok: true, reset: true })
        }
        if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
        const result = await processChatMessage({
          uid,
          text,
          displayName: 'Yaakov',
          historyCollection: 'testChatHistory',
          includeTasks: false,
        })
        return NextResponse.json({ ok: true, reply: result.reply, actions: result.actions, pendingSelections: result.pendingSelections })
      }
      case 'chatPick': {
        const body = await request.json().catch(() => ({}))
        const { searchKey, resultIndex } = body as { searchKey?: string; resultIndex?: number }
        if (!searchKey || resultIndex === undefined) return NextResponse.json({ error: 'searchKey and resultIndex required' }, { status: 400 })
        const result = await selectProduct(uid, searchKey, resultIndex)
        return NextResponse.json({ ok: true, result })
      }
      case 'preselectSlot': {
        if (storeId !== 'shufersal') return NextResponse.json({ error: 'Shufersal-only' }, { status: 400 })
        const body = await request.json().catch(() => ({}))
        const { day, time } = body as { day?: string; time?: string }
        if (!day || !time) return NextResponse.json({ error: 'day and time required' }, { status: 400 })
        const result = await preselectSlot(uid, day, time)
        return NextResponse.json({ ok: result.success, result })
      }
      case 'cancel': {
        const orderId = searchParams.get('orderId')
        if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
        const ok = await store.cancelOrder(uid, orderId)
        return NextResponse.json({ ok, orderId })
      }
      case 'checkout': {
        const body = await request.json().catch(() => ({}))
        const { items, day, time, nearest, dryRun } = body as { items?: { code: string; qty: number }[]; day?: string; time?: string; nearest?: boolean; dryRun?: boolean }
        if (!items || !items.length) return NextResponse.json({ error: 'items required' }, { status: 400 })
        const result = await store.checkout(uid, items, { day, time, nearest, dryRun })
        return NextResponse.json({ ok: true, result })
      }
      case 'orders': {
        const orders = await store.listOrders(uid)
        return NextResponse.json({ ok: true, orders })
      }
      case 'orderItems': {
        const orderId = searchParams.get('orderId')
        if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
        const items = await store.readOrderItems(uid, orderId)
        return NextResponse.json({ ok: true, orderId, items })
      }
      case 'cart': {
        if (storeId !== 'shufersal') return NextResponse.json({ error: 'cart action is Shufersal-only' }, { status: 400 })
        const items = await cartRead(uid)
        return NextResponse.json({ ok: true, items })
      }
      case 'loadAndRead': {
        if (storeId !== 'shufersal') return NextResponse.json({ error: 'loadAndRead action is Shufersal-only' }, { status: 400 })
        const orderId = searchParams.get('orderId')
        if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
        const loaded = await orderLoadToCart(uid, orderId)
        const afterRead = await cartRead(uid)
        return NextResponse.json({ ok: true, orderId, loadedCount: loaded.length, loaded, afterRead })
      }
      case 'trace2': {
        // Load order, remove one, then read cart WITHOUT restoreCart
        if (storeId !== 'shufersal') return NextResponse.json({ error: 'trace2 Shufersal-only' }, { status: 400 })
        const orderId = searchParams.get('orderId')
        if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
        const { cartRemove } = await import('@/app/services/grocery/shufersalClient')
        await orderLoadToCart(uid, orderId)
        const before = await cartRead(uid)
        await cartRemove(uid, '9')
        // Read cart two ways
        const { html: htmlNoRestore } = await _debugFetchHtml(uid, '/cart/load')
        const cheerio = await import('cheerio')
        const $ = cheerio.load(htmlNoRestore)
        const noRestoreCount = $('article.miglog-prod[data-product-code]').length
        const afterRestore = await cartRead(uid)
        return NextResponse.json({
          ok: true,
          orderId,
          beforeCount: before.length,
          noRestoreCount,
          afterRestoreCount: afterRestore.length,
        })
      }
      case 'trace': {
        // Trace the cart state through each step of a modify flow
        if (storeId !== 'shufersal') return NextResponse.json({ error: 'trace is Shufersal-only' }, { status: 400 })
        const orderId = searchParams.get('orderId')
        if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
        const { cartAdd, cartRemove } = await import('@/app/services/grocery/shufersalClient')
        const steps: { step: string; count: number; entries: string[] }[] = []
        const snap = (label: string) => cartRead(uid).then(c => {
          steps.push({ step: label, count: c.length, entries: c.map(i => `${i.entryNumber}=${i.catalogId}`) })
        })
        await orderLoadToCart(uid, orderId)
        await snap('after orderLoadToCart')
        await cartRemove(uid, '9')
        await snap('after cartRemove(9)')
        await cartRemove(uid, '1')
        await snap('after cartRemove(1)')
        await cartRemove(uid, '19')
        await snap('after cartRemove(19)')
        await cartAdd(uid, 'P_7296073734895', 2)
        await snap('after cartAdd chips qty 2')
        return NextResponse.json({ ok: true, orderId, steps })
      }
      case 'dumpHtml': {
        if (storeId !== 'shufersal') return NextResponse.json({ error: 'dumpHtml is Shufersal-only' }, { status: 400 })
        const path = searchParams.get('path') || '/cart/load?restoreCart=true'
        const { status, html } = await _debugFetchHtml(uid, path)
        // Find a block around the first data-product-code occurrence
        const idx = html.indexOf('data-product-code')
        const slice = idx >= 0 ? html.slice(Math.max(0, idx - 600), idx + 3000) : html.slice(0, 3000)
        const entryMatches = [...html.matchAll(/data-entry-number="([^"]+)"/g)].slice(0, 5).map(m => m[1])
        return NextResponse.json({ ok: true, status, htmlLength: html.length, productBlockIdx: idx, entryNumbers: entryMatches, sample: slice })
      }
      case 'session': {
        if (storeId !== 'shufersal') return NextResponse.json({ error: 'session action is Shufersal-only' }, { status: 400 })
        const cookies = await getAuthenticatedCookies(uid)
        const valid = await checkSession(cookies)
        return NextResponse.json({ ok: true, valid, cookieNames: Object.keys(cookies) })
      }
      case 'modifyOrder': {
        const body = await request.json().catch(() => ({}))
        const { orderId, add, remove, slot } = body as { orderId?: string; add?: { productId: string; qty: number }[]; remove?: string[]; slot?: { day: string; time: string } }
        if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 })
        const result = await store.modifyOrder(uid, orderId, { add, remove, slot })
        // Read cart immediately after (no reload) to show post-modification state
        const postCart = storeId === 'shufersal' ? await cartRead(uid) : null
        return NextResponse.json({ ok: true, orderId, result, postCart })
      }
      case 'addToOrder': {
        const body = await request.json().catch(() => ({}))
        const { orderId, productId, qty } = body as { orderId?: string; productId?: string; qty?: number }
        if (!orderId || !productId) return NextResponse.json({ error: 'orderId and productId required' }, { status: 400 })
        const result = await store.modifyOrder(uid, orderId, { add: [{ productId, qty: qty || 1 }] })
        return NextResponse.json({ ok: true, orderId, result })
      }
      case 'removeFromOrder': {
        const body = await request.json().catch(() => ({}))
        const { orderId, entryRef } = body as { orderId?: string; entryRef?: string }
        if (!orderId || !entryRef) return NextResponse.json({ error: 'orderId and entryRef required' }, { status: 400 })
        const result = await store.modifyOrder(uid, orderId, { remove: [entryRef] })
        return NextResponse.json({ ok: true, orderId, result })
      }
      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[grocery/test] action=${action} error:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) { return handle(request) }
export async function POST(request: NextRequest) { return handle(request) }
