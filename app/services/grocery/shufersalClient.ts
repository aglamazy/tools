/* eslint-disable max-lines -- single-purpose Shufersal HTTP client: auth, cart, search, slots, checkout (incl. edit-order), and order ops. Splitting would force exporting internal helpers (shuFetch, getCsrf, findMatchingSlot, etc.) for no reader benefit. */
/**
 * Shufersal HTTP client — ported from Python (~/develop/claw/projects/shufersal/v2).
 * Pure HTTP, no browser automation.
 *
 * Session cookies stored in Firestore groceries/{uid}/session.
 * Credentials stored in Firestore groceries/{uid}/credentials (server-encrypted).
 */

import dns from 'dns'
import https from 'https'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import * as cheerio from 'cheerio'
import { encryptCred, decryptCred, looksEncrypted } from '@/app/services/security/credEncryption'
import { hasCurrentServerCredsConsent, NoTier3ConsentError } from '@/app/services/consentService'

const BASE_URL = 'https://www.shufersal.co.il/online/he'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
const PROXY_URL = process.env.SHUFERSAL_PROXY_URL || ''
const PROXY_SECRET = process.env.SHUFERSAL_PROXY_SECRET || ''
const USE_PROXY = process.env.NODE_ENV === 'production' && !!PROXY_URL

// Direct connection: IPv4-only agent for local dev
dns.setDefaultResultOrder('ipv4first')
const directAgent = new https.Agent({
  lookup: (hostname: string, opts: any, cb: any) => {
    if (typeof opts === 'function') { cb = opts; opts = {} }
    dns.lookup(hostname, { ...opts, family: 4 }, cb)
  },
})

// --- Types ---

export interface ShufersalSession {
  cookies: Record<string, string>
  updatedAt: string
}

export interface ShufersalCredentials {
  email: string
  password: string
}

export interface CartItem {
  catalogId: string
  name: string
  price: string
  qty: number
  entryNumber: string | null
}

export interface DeliverySlot {
  day: string       // Hebrew day name
  date: string      // DD/MM
  time: string      // e.g. "13:00"
  price: string
  code: string
}

export interface DeliveryDay {
  day: string
  date: string
  slots: DeliverySlot[]
}

export interface CheckoutResult {
  success: boolean
  orderId?: string
  deliveryWindow?: { day: string; date: string; time: string }
  error?: string
  dryRun?: boolean
}

export interface SearchResult {
  catalogId: string
  name: string
  brand: string
  price: string
  unitPrice: string  // e.g. "11.56 ש"ח ל-100 גרם"
}

// --- HTTP via Cloud Run proxy ---

interface ShuResponse {
  status: number
  text: () => string
  json: () => any
  ok: boolean
  headers: { get: (name: string) => string | null }
}

const WIRE_LOG = process.env.SHUFERSAL_WIRE_LOG !== '0'

/**
 * Route Shufersal HTTP calls: direct in dev, via Cloud Run proxy in production.
 * One-line wire log per call (method, path, status, bodyLen, ms). Disable with SHUFERSAL_WIRE_LOG=0.
 */
async function shuFetch(
  path: string,
  cookies: Record<string, string>,
  options: RequestInit = {},
): Promise<{ resp: ShuResponse; cookies: Record<string, string> }> {
  const method = (options.method as string) || 'GET'
  const route = USE_PROXY ? 'proxy' : 'direct'
  const t0 = Date.now()
  try {
    const out = await (USE_PROXY ? shuFetchProxy(path, cookies, options) : shuFetchDirect(path, cookies, options))
    if (WIRE_LOG) {
      const bodyLen = out.resp.text().length
      const loc = out.resp.headers.get('location')
      console.log(`[Shufersal/wire] ${method} ${path} → ${out.resp.status} ${bodyLen}b ${Date.now() - t0}ms via=${route}${loc ? ` loc=${loc}` : ''}`)
    }
    return out
  } catch (err) {
    if (WIRE_LOG) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Shufersal/wire] ${method} ${path} → ERROR ${Date.now() - t0}ms via=${route}: ${msg}`)
    }
    throw err
  }
}

/** Direct HTTP connection (local dev) */
async function shuFetchDirect(
  path: string,
  cookies: Record<string, string>,
  options: RequestInit = {},
): Promise<{ resp: ShuResponse; cookies: Record<string, string> }> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  const extraHeaders = (options.headers as Record<string, string>) || {}
  const method = (options.method as string) || 'GET'
  const body = typeof options.body === 'string' ? options.body : undefined

  const raw = await new Promise<{ statusCode: number; setCookies: string[]; body: string; location: string | null }>((resolve, reject) => {
    const parsed = new URL(url)
    // Encode [] in query params — Shufersal requires %5B%5D not raw brackets
    const reqPath = parsed.pathname + parsed.search.replace(/\[/g, '%5B').replace(/\]/g, '%5D')
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: reqPath,
      method,
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Accept-Language': 'he-IL,he;q=0.9',
        'Cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
        ...extraHeaders,
      },
      agent: directAgent,
      timeout: 30000,
    }, (res) => {
      const sc: string[] = []
      for (let i = 0; i < res.rawHeaders.length; i += 2) {
        if (res.rawHeaders[i].toLowerCase() === 'set-cookie') sc.push(res.rawHeaders[i + 1])
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({
        statusCode: res.statusCode || 0,
        setCookies: sc,
        body: Buffer.concat(chunks).toString('utf-8'),
        location: res.headers.location || null,
      }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
    if (body) req.write(body)
    req.end()
  })

  const updatedCookies = { ...cookies }
  for (const sc of raw.setCookies) {
    const match = sc.match(/^\s*([^=]+)=([^;]*)/)
    if (match && match[2]) updatedCookies[match[1].trim()] = match[2]
  }

  const bodyText = raw.body
  return {
    resp: {
      status: raw.statusCode,
      ok: raw.statusCode >= 200 && raw.statusCode < 300,
      text: () => bodyText,
      json: () => JSON.parse(bodyText),
      headers: { get: (name: string) => name.toLowerCase() === 'location' ? raw.location : null },
    },
    cookies: updatedCookies,
  }
}

/** Via Cloud Run proxy (production) */
async function shuFetchProxy(
  path: string,
  cookies: Record<string, string>,
  options: RequestInit = {},
): Promise<{ resp: ShuResponse; cookies: Record<string, string> }> {
  if (!PROXY_URL) throw new Error('SHUFERSAL_PROXY_URL not configured')

  const proxyBody = {
    method: (options.method as string) || 'GET',
    path,
    headers: (options.headers as Record<string, string>) || {},
    body: typeof options.body === 'string' ? options.body : undefined,
    cookies,
  }

  let resp: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Proxy-Secret': PROXY_SECRET },
      body: JSON.stringify(proxyBody),
    })
    if (resp.status !== 429) break
    const wait = (attempt + 1) * 2000
    console.log(`[Shufersal] Rate limited, retrying in ${wait}ms...`)
    await new Promise(r => setTimeout(r, wait))
  }

  if (!resp || !resp.ok) {
    const errText = resp ? await resp.text() : 'No response'
    throw new Error(`Proxy error ${resp?.status}: ${errText}`)
  }

  const raw = await resp.json() as { status: number; body: string; setCookies: Record<string, string>; location: string | null }
  const updatedCookies = { ...cookies, ...raw.setCookies }
  const bodyText = raw.body

  return {
    resp: {
      status: raw.status,
      ok: raw.status >= 200 && raw.status < 300,
      text: () => bodyText,
      json: () => JSON.parse(bodyText),
      headers: { get: (name: string) => name.toLowerCase() === 'location' ? raw.location : null },
    },
    cookies: updatedCookies,
  }
}

function getCsrf(cookies: Record<string, string>): string {
  return cookies['XSRF-TOKEN'] || ''
}

// --- Session management (Firestore) ---

async function loadSession(uid: string): Promise<ShufersalSession | null> {
  const doc = await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('session').get()
  if (!doc.exists) return null
  return doc.data() as ShufersalSession
}

async function saveSession(uid: string, session: ShufersalSession): Promise<void> {
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('session').set(session)
}

async function loadCredentials(uid: string): Promise<ShufersalCredentials | null> {
  const doc = await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('credentials').get()
  if (!doc.exists) return null
  const raw = doc.data() as { email?: string; password?: string; verified?: boolean }
  if (!raw.email || !raw.password) return null
  // Tier-3 docs are written as ciphertext (`encryptCred`); decrypt on read.
  // During the rollout window plaintext docs may still exist — `looksEncrypted`
  // is the sniff. Once everyone's been re-saved this branch becomes dead code
  // but it's cheap and keeps the rollout safe.
  const email = looksEncrypted(raw.email) ? decryptCred(raw.email) : raw.email
  const password = looksEncrypted(raw.password) ? decryptCred(raw.password) : raw.password
  return { email, password }
}

/**
 * Persist Shufersal credentials server-side (Tier 3 only).
 *
 * Per the Saliko privacy policy (`SALIKO_PRIVACY_TIERS.loggedInWithServerCreds`)
 * a logged-in user MUST have explicit consent on file before any plaintext
 * credential leaves their browser. Without consent we throw `NoTier3ConsentError`
 * and the caller is expected to walk the user through the consent prompt before
 * retrying.
 *
 * Both email and password are encrypted at rest (AES-256-GCM via the env-key
 * helper). Email is encrypted too: it's PII per the policy and there's no
 * read-side need for plaintext here — `login()` decrypts on demand.
 */
export async function saveCredentials(uid: string, email: string, password: string): Promise<void> {
  const consented = await hasCurrentServerCredsConsent(uid)
  if (!consented) {
    throw new NoTier3ConsentError(
      'NO_TIER3_CONSENT: cannot persist Shufersal credentials server-side without Tier-3 consent. ' +
      'Have the user accept the server-credentials consent prompt and retry.',
    )
  }
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('credentials').set({
      email: encryptCred(email),
      password: encryptCred(password),
      verified: false,
    })
}

export async function setCredentialsVerified(uid: string, verified: boolean): Promise<void> {
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('credentials').update({ verified })
}

export async function isCredentialsVerified(uid: string): Promise<boolean> {
  const doc = await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('credentials').get()
  if (!doc.exists) return false
  return doc.data()?.verified === true
}

export async function hasCredentials(uid: string): Promise<boolean> {
  const doc = await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('credentials').get()
  return doc.exists
}

// --- Auth ---

export async function login(uid: string): Promise<Record<string, string>> {
  const creds = await loadCredentials(uid)
  if (!creds) throw new Error('Shufersal credentials not configured')

  // Step 1: GET login page for CSRF
  let cookies: Record<string, string> = {}
  const { resp: loginPage, cookies: c1 } = await shuFetch('/login', cookies)
  cookies = c1
  console.log(`[Shufersal] Login page: status=${loginPage.status} cookies=${Object.keys(cookies).join(',')}`)

  // Follow redirect if needed
  if (loginPage.status >= 300 && loginPage.status < 400) {
    const loc = loginPage.headers.get('location')
    if (loc) {
      console.log(`[Shufersal] Following redirect: ${loc}`)
      const { cookies: c1b } = await shuFetch(loc, cookies)
      cookies = c1b
    }
  }

  const csrf = getCsrf(cookies)
  console.log(`[Shufersal] CSRF: ${csrf ? 'found' : 'MISSING'} cookies=${JSON.stringify(Object.keys(cookies))}`)
  if (!csrf) throw new Error('Failed to get CSRF token from login page')

  // Step 2: POST login
  const body = new URLSearchParams({
    fail_url: '/login/?error=true',
    j_username: creds.email,
    j_password: creds.password,
    'remember-me': 'True',
    CSRFToken: csrf,
  })

  const { resp: loginResp, cookies: c2 } = await shuFetch('/j_spring_security_check', cookies, {
    method: 'POST',
    body: body.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://www.shufersal.co.il',
      'Referer': `${BASE_URL}/login`,
    },
  })
  cookies = c2

  console.log(`[Shufersal] Login POST: status=${loginResp.status} location=${loginResp.headers.get('location') || 'none'} cookies=${Object.keys(cookies).join(',')}`)

  if (loginResp.status !== 302) {
    const loc = loginResp.headers.get('location') || ''
    if (loc.includes('error')) throw new Error('Login failed: bad credentials')
  }

  // Follow redirect to complete login
  const loc = loginResp.headers.get('location')
  if (loc) {
    const { cookies: c3 } = await shuFetch(loc, cookies)
    cookies = c3
  }

  await saveSession(uid, { cookies, updatedAt: new Date().toISOString() })
  console.log(`[Shufersal] Login success for uid=${uid}`)
  return cookies
}

export async function getAuthenticatedCookies(uid: string): Promise<Record<string, string>> {
  const session = await loadSession(uid)
  if (session) return session.cookies
  return login(uid)
}

/** Get cookies, but re-login if the response indicates expired session. */
async function withAuth<T>(
  uid: string,
  fn: (cookies: Record<string, string>) => Promise<T>,
  isInvalid: (result: T) => boolean,
): Promise<T> {
  let cookies = await getAuthenticatedCookies(uid)
  const result = await fn(cookies)
  if (!isInvalid(result)) return result
  console.log(`[Shufersal] Session expired for uid=${uid}, re-logging in`)
  cookies = await login(uid)
  return fn(cookies)
}

export async function checkSession(cookies: Record<string, string>): Promise<boolean> {
  try {
    const { resp } = await shuFetch('/authentication/get-status-includes-otp', cookies)
    const text = await resp.text()
    console.log(`[Shufersal] checkSession: status=${resp.status} bodyLen=${text.length} isHtml=${text.trimStart().startsWith('<')}`)
    // Invalid session returns HTML (login page) or contains "anonymous"
    if (text.trimStart().startsWith('<')) return false
    if (text.toLowerCase().includes('anonymous')) return false
    return resp.status === 200
  } catch (err) {
    console.error('[Shufersal] checkSession error:', err)
    return false
  }
}

// --- Cart ---

export async function cartRead(uid: string): Promise<CartItem[]> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch('/cart/load?restoreCart=true', cookies)
  const html = await resp.text()
  return parseCart(html)
}

/** Debug helper — fetch raw HTML of any Shufersal path using authenticated cookies. */
export async function _debugFetchHtml(uid: string, path: string): Promise<{ status: number; html: string }> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch(path, cookies)
  return { status: resp.status, html: await resp.text() }
}

/**
 * Enter edit-order mode. After orderLoadToCart, call this with toMerge=false so
 * Shufersal drops the user's existing cart and keeps only the order's items.
 * Subsequent /cart/update and /cart/add calls then modify the order-edit cart.
 */
export async function cartMerge(uid: string, toMerge = false): Promise<void> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch(`/cart/merge?toMerge=${toMerge}`, cookies)
  console.log(`[Shufersal] cartMerge toMerge=${toMerge}: status=${resp.status}`)
}

/** Find slot by day (Hebrew) + time, set it as the preselected delivery slot. */
export async function preselectSlot(uid: string, day: string, time: string): Promise<{ success: boolean; slot?: DeliverySlot; error?: string }> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch('/timeSlot/preselection/getHomeDeliverySlots?amount=1.0', cookies)
  if (!resp.ok) return { success: false, error: `slots fetch ${resp.status}` }
  const rawSlots = await resp.json() as Record<string, any[]>
  const slot = findMatchingSlot(rawSlots, day, time, false)
  if (!slot) return { success: false, error: `no slot matches day=${day} time=${time}` }

  await shuFetch('/timeSlot/preselection/postHomeDeliverySlot', cookies, {
    method: 'POST',
    body: JSON.stringify({ homeDeliveryTimeSlot: { code: slot.code, sourceOfSupply: 'DIRECT' } }),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  })
  console.log(`[Shufersal] preselectSlot: ${slot.day} ${slot.date} ${slot.time} code=${slot.code}`)
  return { success: true, slot }
}

export async function cartClear(uid: string): Promise<number> {
  const items = await cartRead(uid)
  let removed = 0
  for (const item of items) {
    if (item.entryNumber) {
      try {
        await cartRemove(uid, item.entryNumber)
        removed++
      } catch (err) {
        console.error(`[Shufersal] Failed to remove entry ${item.entryNumber}:`, err)
      }
    }
  }
  console.log(`[Shufersal] Cart cleared: ${removed}/${items.length} items`)
  return removed
}

export async function cartAdd(uid: string, productCode: string, qty = 1): Promise<void> {
  const cookies = await getAuthenticatedCookies(uid)
  const csrf = getCsrf(cookies)

  const { resp } = await shuFetch('/cart/add?cartContext[openFrom]=CART&cartContext[recommendationType]=REGULAR', cookies, {
    method: 'POST',
    body: JSON.stringify({
      productCodePost: productCode,
      productCode,
      sellingMethod: 'BY_UNIT',
      qty: String(qty),
      frontQuantity: String(qty),
      comment: '',
      affiliateCode: '',
    }),
    headers: {
      'Content-Type': 'application/json',
      'csrftoken': csrf,
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  // 302 is normal for /cart/add (redirect to cart page).
  if (!resp.ok && resp.status !== 302) {
    throw new Error(`HTTP ${resp.status}`)
  }
}

/**
 * Add many products to the cart. Shares one cookie jar across the whole loop
 * and re-derives `csrftoken` from the rotated cookies on every iteration.
 *
 * The previous in-place loop reused a single `csrf` value computed once; that
 * was the 2026-04-26 "1/9 added" Sunday-cron bug — Shufersal rotates CSRF
 * after the first add so items 2..N got 302 with no cart effect. The naive
 * fix (loop calling `cartAdd`, which refetches cookies from Firestore each
 * call) is correct but spent ~2-3 s/item; with cartClear×7 the iteration
 * blew the 25 s budget after 3/8 adds (2026-04-28 08:00 UTC).
 */
export async function cartAddMany(
  uid: string,
  items: { code: string; qty: number }[],
): Promise<{ added: number; failed: { code: string; error: string }[] }> {
  const cookies = await getAuthenticatedCookies(uid)
  console.log(`[Shufersal] cartAddMany: ${items.length} items, cookies=${Object.keys(cookies).join(',')}`)
  let added = 0
  const failed: { code: string; error: string }[] = []

  for (const item of items) {
    try {
      // CSRF is in cookies['XSRF-TOKEN']; getCsrf() rereads it after each
      // Object.assign so we pick up Shufersal's rotation.
      const csrf = getCsrf(cookies)
      const { resp, cookies: updated } = await shuFetch(
        '/cart/add?cartContext[openFrom]=CART&cartContext[recommendationType]=REGULAR',
        cookies,
        {
          method: 'POST',
          body: JSON.stringify({
            productCodePost: item.code,
            productCode: item.code,
            sellingMethod: 'BY_UNIT',
            qty: String(item.qty),
            frontQuantity: String(item.qty),
            comment: '',
            affiliateCode: '',
          }),
          headers: {
            'Content-Type': 'application/json',
            'csrftoken': csrf,
            'X-Requested-With': 'XMLHttpRequest',
          },
        },
      )
      Object.assign(cookies, updated)
      // 302 is normal for /cart/add (redirect to cart page).
      if (!resp.ok && resp.status !== 302) {
        throw new Error(`HTTP ${resp.status}`)
      }
      added++
      console.log(`[Shufersal] cartAdd ${item.code}: ok (${added}/${items.length})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Shufersal] cartAdd ${item.code} FAILED: ${msg}`)
      failed.push({ code: item.code, error: msg })
    }
  }

  // Persist the rotated cookies so subsequent calls (place order, etc.) see
  // Shufersal's latest CSRF/session state.
  await saveSession(uid, { cookies, updatedAt: new Date().toISOString() })
  return { added, failed }
}

export async function cartRemove(uid: string, entryNumber: string): Promise<void> {
  const cookies = await getAuthenticatedCookies(uid)

  // Get fresh CSRF from page
  const { resp: page, cookies: c1 } = await shuFetch('/cart/cartsummary', cookies)
  Object.assign(cookies, c1)
  const pageHtml = await page.text()
  const csrf = extractCsrfToken(pageHtml) || getCsrf(cookies)

  const params = new URLSearchParams({
    entryNumber,
    qty: '0',
    sellingMethod: '',
    'cartContext[openFrom]': 'CART',
    'cartContext[recommendationType]': 'REGULAR',
    'cartContext[action]': 'remove',
  })

  const { resp } = await shuFetch(`/cart/update?${params}`, cookies, {
    method: 'POST',
    body: `quantity=0&CSRFToken=${csrf}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const body = await resp.text()
  const parsed = parseCart(body)
  console.log(`[Shufersal] cartRemove entry=${entryNumber} status=${resp.status} responseItems=${parsed.length} codes=${parsed.slice(0,5).map(p => p.catalogId).join(',')}`)
}

// --- Search ---

export async function search(uid: string, query: string): Promise<SearchResult[]> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch(`/search?q=${encodeURIComponent(query)}`, cookies, {
    headers: { 'Accept': 'text/html' },
  })
  const html = await resp.text()
  return parseSearchResults(html)
}

// --- Delivery slots ---

export async function listSlots(uid: string): Promise<DeliveryDay[]> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch('/timeSlot/preselection/getHomeDeliverySlots?amount=1.0', cookies)
  if (!resp.ok) throw new Error(`Failed to fetch slots: ${resp.status}`)

  const raw = await resp.json() as Record<string, any[]>
  return parseSlotsResponse(raw)
}

// --- Checkout ---

export async function checkout(
  uid: string,
  items: { code: string; qty: number }[],
  options: { day?: string; time?: string; nearest?: boolean; dryRun?: boolean },
): Promise<CheckoutResult> {
  const creds = await loadCredentials(uid)
  if (!creds) return { success: false, error: 'Credentials not configured' }

  // === CLEAR + BUILD CART ===
  if (items.length > 0) {
    await cartClear(uid)
    const result = await cartAddMany(uid, items)
    console.log(`[Shufersal] Cart built: ${result.added}/${items.length} items`)
    if (result.added === 0) {
      return { success: false, error: 'No items added to cart' }
    }
  }

  // Reload cookies after cart build (cartAddMany saves updated session)
  const cookies = await getAuthenticatedCookies(uid)

  // === GET SLOTS ===
  const { resp: slotsResp } = await shuFetch(
    '/timeSlot/preselection/getHomeDeliverySlots?amount=1.0', cookies,
  )
  if (!slotsResp.ok) return { success: false, error: `Failed to fetch slots: ${slotsResp.status}` }

  const rawSlots = await slotsResp.json() as Record<string, any[]>
  console.log(`[Shufersal] Slots: ${Object.keys(rawSlots).length} days, day=${options.day || 'any'} nearest=${options.nearest}`)
  let slot = findMatchingSlot(rawSlots, options.day, options.time, options.nearest)
  // Fallback to nearest if preferred day not available
  if (!slot && options.day) {
    console.log(`[Shufersal] Preferred day "${options.day}" not available, using nearest`)
    slot = findMatchingSlot(rawSlots, undefined, undefined, true)
  }
  if (!slot) return { success: false, error: 'No matching delivery slot found' }

  console.log(`[Shufersal] Selected slot: ${slot.day} ${slot.date} ${slot.time}`)

  // === SET SLOT (preselection) ===
  await shuFetch('/timeSlot/preselection/postHomeDeliverySlot', cookies, {
    method: 'POST',
    body: JSON.stringify({
      homeDeliveryTimeSlot: { code: slot.code, sourceOfSupply: 'DIRECT' },
    }),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  })

  const deliveryWindow = { day: slot.day, date: slot.date, time: slot.time }

  // Global kill-switch for the test pipeline: SALIKO_DRY_RUN=true forces every
  // checkout to short-circuit before commit.
  if (options.dryRun || process.env.SALIKO_DRY_RUN === 'true') {
    return { success: false, dryRun: true, deliveryWindow }
  }

  return commitCheckout(uid, { slot, deliveryWindow })
}

/**
 * Run the post-cart commit flow: auth → SSO → optional slot-set → JWT → placeOrder.
 * Used by both new-order checkout and edit-order commit. Assumes the cart is
 * already populated (either built from items or loaded from an order via cartMerge).
 */
export async function commitCheckout(
  uid: string,
  options: {
    slot?: DeliverySlot | null
    deliveryWindow?: { day: string; date: string; time: string }
    isEdit?: boolean
  } = {},
): Promise<CheckoutResult> {
  const creds = await loadCredentials(uid)
  if (!creds) return { success: false, error: 'Credentials not configured' }

  const cookies = await getAuthenticatedCookies(uid)
  const csrf = getCsrf(cookies)
  const slot = options.slot
  const deliveryWindow = options.deliveryWindow
  // Edit mode is declared explicitly by the caller when there's no NEW slot,
  // OR when committing a slot change on an existing order.
  const isEdit = options.isEdit ?? !slot

  if (isEdit) {
    // Edit flow observed via MCP DevTools capture:
    // 1. cart-order-updatable check
    // 2. POST cart/checkout/auth (XHR) — password validation
    // 3. POST checkout/j_spring_security_check (form, not XHR) — session upgrade + redirect to /checkout
    // 4. Follow redirect chain to /miglog-checkout
    const { resp: updResp } = await shuFetch('/checkout/cart-order-updatable', cookies)
    console.log(`[Shufersal] cart-order-updatable: status=${updResp.status}`)

    const editCsrf = getCsrf(cookies)
    const pwForm = new URLSearchParams({
      redirect_url: '/checkout',
      j_username: creds.email,
      j_password: creds.password,
      recaptcha_token: '',
      strongAuth: 'false',
      CSRFToken: editCsrf,
    }).toString()

    // Step 2: XHR password validation
    const { resp: pwXhr, cookies: pwXhrCookies } = await shuFetch('/cart/checkout/auth', cookies, {
      method: 'POST',
      body: pwForm,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
    })
    Object.assign(cookies, pwXhrCookies)
    const pwXhrBody = await pwXhr.text()
    console.log(`[Shufersal] Edit XHR auth: status=${pwXhr.status} body=${pwXhrBody.slice(0, 120)}`)
    if (pwXhr.status !== 200 || !pwXhrBody.includes('"success":true')) {
      return { success: false, error: `Edit auth (XHR) failed: ${pwXhr.status} ${pwXhrBody.slice(0, 200)}`, deliveryWindow }
    }

    // Step 3: form POST — upgrades the session. Returns 405 if session is
    // already in checkout context (e.g. subsequent edit round), in which case
    // we skip straight to navigation.
    const accjwtBefore = cookies.accjwt?.slice(0, 30) || 'none'
    const { resp: springResp, cookies: springCookies } = await shuFetch('/checkout/j_spring_security_check', cookies, {
      method: 'POST',
      body: pwForm,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    Object.assign(cookies, springCookies)
    const accjwtAfter = cookies.accjwt?.slice(0, 30) || 'none'
    console.log(`[Shufersal] Edit spring auth: status=${springResp.status} loc=${springResp.headers.get('location') || '-'} accjwtChanged=${accjwtBefore !== accjwtAfter}`)

    // Step 4: navigate to /miglog-checkout to verify we're in checkout context.
    // If spring returned 302, follow its location; otherwise go direct.
    let mloc: string | null = springResp.status === 302
      ? springResp.headers.get('location')
      : '/miglog-checkout'
    let landedOnCheckout = false
    for (let i = 0; i < 6 && mloc; i++) {
      const { resp: r, cookies: c } = await shuFetch(mloc, cookies)
      Object.assign(cookies, c)
      console.log(`[Shufersal] Edit nav ${i}: ${r.status} → ${mloc.slice(0, 80)}`)
      if (r.status === 200 && mloc.includes('miglog-checkout')) landedOnCheckout = true
      mloc = r.status === 302 ? r.headers.get('location') : null
    }
    if (!landedOnCheckout) {
      return { success: false, error: 'Failed to enter checkout context — session not authenticated', deliveryWindow }
    }
    await saveSession(uid, { cookies, updatedAt: new Date().toISOString() })
    console.log(`[Shufersal] Edit cookies after: ${Object.keys(cookies).join(',')}`)
  } else {
    // New-order flow: Spring Security form post
    const { resp: authResp, cookies: authCookies } = await shuFetch('/checkout/j_spring_security_check', cookies, {
      method: 'POST',
      body: new URLSearchParams({
        j_username: creds.email,
        j_password: creds.password,
        redirect_url: `${BASE_URL}/miglog-checkout`,
        fail_url: '/login/?error=true',
        CSRFToken: csrf,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    Object.assign(cookies, authCookies)
    console.log(`[Shufersal] Checkout auth: status=${authResp.status}`)

    // Follow redirect chain: /checkout → /miglog-checkout
    if (authResp.status === 302) {
      let loc = authResp.headers.get('location')
      for (let i = 0; i < 5 && loc; i++) {
        const { resp: r, cookies: c } = await shuFetch(loc, cookies)
        Object.assign(cookies, c)
        console.log(`[Shufersal] Auth redirect ${i + 1}: ${r.status} → ${loc.slice(0, 60)}`)
        loc = r.status === 302 ? r.headers.get('location') : null
      }
    }
  }

  // === SSO TOKEN (required for payment gateway) ===
  const { resp: ssoResp, cookies: ssoCookies } = await shuFetch('/miglog-sso/customer-token', cookies)
  Object.assign(cookies, ssoCookies)
  console.log(`[Shufersal] SSO token: status=${ssoResp.status}`)

  // === SET SLOT (checkout context) — only for new orders. Edits keep existing slot. ===
  if (slot) {
    const checkoutCsrf = getCsrf(cookies)
    const { resp: slotSetResp, cookies: slotCookies } = await shuFetch('/checkout/timeSlot/postHomeDeliverySlot', cookies, {
      method: 'POST',
      body: JSON.stringify({
        homeDeliveryTimeSlot: { code: slot.code, sourceOfSupply: 'DIRECT' },
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'csrftoken': checkoutCsrf,
      },
    })
    Object.assign(cookies, slotCookies)
    const slotBody = await slotSetResp.text()
    console.log(`[Shufersal] Checkout slot set: status=${slotSetResp.status} body=${slotBody.slice(0, 300)}`)
  }

  // === GET PAYMENT JWT from Payme ===
  const jwtResp = await fetch('https://hf.payme.io/client-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://www.shufersal.co.il',
      'Referer': 'https://www.shufersal.co.il/',
    },
    body: JSON.stringify({
      isTestMode: false, ip: null, accept: null,
      javaEnabled: false, javaScriptEnabled: true,
      language: 'he-IL', colorDepth: 24,
      screen: { height: 1080, width: 1920 },
      timezone: -180,
      userAgent: UA.toLowerCase(),
    }),
  })
  const jwtData = await jwtResp.json() as { hash: string }
  const jwtPayme = jwtData.hash
  if (!jwtPayme) return { success: false, error: 'Failed to get payment token', deliveryWindow }
  console.log(`[Shufersal] Got Payme JWT (${jwtPayme.length} chars)`)

  console.log(`[Shufersal] Pre-placeOrder cookies: ${Object.keys(cookies).join(',')}`)

  // === PLACE ORDER ===
  const { resp: orderResp, cookies: orderCookies } = await shuFetch(
    `/checkout/placeOrder?jwtPayme=${encodeURIComponent(jwtPayme)}&after3ds=false`, cookies,
  )
  Object.assign(cookies, orderCookies)
  const orderBody = await orderResp.text()
  console.log(`[Shufersal] Place order: status=${orderResp.status} location=${orderResp.headers.get('location') || '-'} body=${orderBody.slice(0, 500)}`)

  if (orderResp.status !== 200) {
    return { success: false, error: `Place order failed: ${orderResp.status} — ${orderBody.slice(0, 200)}`, deliveryWindow }
  }

  // Check for error in response body (placeOrder returns 200 even on errors)
  if (orderBody.includes('ERROR') || orderBody.includes('TIMESLOT_UNAVAILABLE')) {
    return { success: false, error: `Place order error: ${orderBody.slice(0, 300)}`, deliveryWindow }
  }
  try {
    const orderJson = JSON.parse(orderBody)
    if (orderJson.success === false) {
      const reason = orderJson.directCreditCardError ? 'שגיאת כרטיס אשראי'
        : orderJson.otherCreditCardError ? 'שגיאת אמצעי תשלום אחר'
        : 'הזמנה נדחתה'
      return { success: false, error: `Place order failed: ${reason}`, deliveryWindow }
    }
  } catch {
    // not JSON — continue
  }

  // === GET ORDER ID ===
  let orderId: string | null = null
  try {
    const { resp: ordersResp } = await shuFetch('/my-account/orders', cookies, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    const rawText = await ordersResp.text()
    const orders = JSON.parse(rawText) as any
    const active = orders.activeOrders || []
    if (active.length > 0) {
      orderId = active[0].code
      console.log(`[Shufersal] Order ID: ${orderId}`)
    }
  } catch (err) {
    console.error('[Shufersal] Failed to get order ID:', err)
  }

  // Save updated session
  await saveSession(uid, { cookies, updatedAt: new Date().toISOString() })

  console.log(`[Shufersal] Order placed: #${orderId || 'unknown'}`)
  return { success: true, orderId: orderId || undefined, deliveryWindow }
}

// --- Orders ---

export interface OrderEntry {
  name: string
  code: string
  qty: number
  price: string
}

export interface OrderDelivery {
  date: string
  time: string
  endTime: string
  consignmentCode: string
}

export interface ActiveOrder {
  orderId: string
  status: string
  total: string
  delivery: OrderDelivery
  itemsCount: number
  updatable: boolean
  cancelable: boolean
  updateDeadline: string
  items: OrderEntry[]
}

export async function ordersList(uid: string): Promise<ActiveOrder[]> {
  const data = await withAuth(
    uid,
    async (cookies) => {
      const { resp } = await shuFetch('/my-account/orders', cookies, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      const rawText = await resp.text()
      try {
        return JSON.parse(rawText) as any
      } catch {
        // Non-JSON = expired session (login page HTML)
        return null
      }
    },
    (result) => result === null,
  )
  if (!data) throw new Error('Shufersal returned non-JSON response after re-login')
  const active = data.activeOrders || []

  return active.map((o: any) => {
    // Items from entries
    const entries: OrderEntry[] = (o.entries || []).map((e: any) => {
      const product = e.product || {}
      return {
        name: product.name || '',
        code: product.code || '',
        qty: e.quantity || 0,
        price: e.totalPrice?.formattedValue || '',
      }
    })

    // Delivery from consignments (matches Python parser exactly)
    const delivery: OrderDelivery = { date: '', time: '', endTime: '', consignmentCode: '' }
    const consignments = o.consignments || []
    if (consignments.length > 0) {
      const c = consignments[0]
      delivery.date = c.timeSlotStartDateString || ''
      delivery.time = c.timeSlotStartHoursString || ''
      delivery.endTime = c.timeSlotEndHoursString || ''
      delivery.consignmentCode = c.code || ''
    }

    const updateDeadline = [o.updateToDateString, o.updateToHourString].filter(Boolean).join(' ')

    return {
      orderId: o.code || '',
      status: o.statusDisplay || '',
      total: o.totalPriceWithTax?.formattedValue || '',
      delivery,
      itemsCount: o.totalItems || entries.length,
      updatable: o.isUpdatable ?? false,
      cancelable: o.isCancelable ?? false,
      updateDeadline,
      items: entries,
    }
  })
}

export async function orderIsUpdatable(uid: string, orderId: string): Promise<boolean> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch(`/my-account/orders/${orderId}/is-timeslot-updatable`, cookies)
  const text = await resp.text()
  return text.trim().toLowerCase() === 'true'
}

export async function orderLoadToCart(uid: string, orderId: string): Promise<CartItem[]> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch(`/cart/cartFromOrder/${orderId}`, cookies)
  return parseCart(await resp.text())
}

export async function cancelOrder(uid: string, orderId: string): Promise<boolean> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch(`/my-account/orders/${orderId}`, cookies, {
    method: 'DELETE',
  })
  console.log(`[Shufersal] Cancel order #${orderId}: ${resp.status}`)
  return resp.ok
}

// --- HTML parsers (cheerio port of Python BeautifulSoup code) ---

function parseCart(html: string): CartItem[] {
  const $ = cheerio.load(html)
  const items: CartItem[] = []
  const seen = new Set<string>()
  $('article.miglog-prod[data-product-code]').each((_, el) => {
    const $el = $(el)
    const catalogId = $el.attr('data-product-code') || ''
    const entryNumber = $el.attr('data-entry-number') || null
    const key = `${catalogId}|${entryNumber ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    const entryQty = parseFloat($el.attr('data-entry-qty') || '')
    const qty = Number.isFinite(entryQty)
      ? entryQty
      : parseInt($el.find('input.js-qty-selector-input').attr('value') || '1', 10)
    items.push({
      catalogId,
      name: $el.find('.miglog-prod-name').first().text().trim(),
      price: $el.find('.miglog-prod-totalPrize').first().text().trim(),
      qty,
      entryNumber,
    })
  })
  return items
}

function parseSearchResults(html: string): SearchResult[] {
  const $ = cheerio.load(html)
  const results: SearchResult[] = []
  $('li[data-product-code]').each((_, el) => {
    const $el = $(el)
    const code = $el.attr('data-product-code') || ''
    let name = ''
    const addBtn = $el.find('button.js-add-to-cart')
    if (addBtn.length) {
      name = addBtn.text().replace(/הוספה\s*כמות/g, '').trim()
    } else {
      name = $el.find('[class*=tileName], [class*=tile-title], h3, h4, .line').first().text().trim()
    }

    const priceText = $el.find('.number, .totalPrice').first().text().trim()
    const priceMatch = priceText.match(/(כ-\s*)?([\d.]+)/)

    let brand = ''
    const brandSpans = $el.find('.brand-name span')
    if (brandSpans.length >= 2) {
      brand = brandSpans.last().text().trim()
    }

    const unitPriceText = $el.find('.pricePerUnit, [class*=pricePerUnit]').text().trim()
      .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

    results.push({
      catalogId: code,
      name,
      brand,
      price: priceMatch?.[0] || '',
      unitPrice: unitPriceText,
    })
  })
  return results
}

function extractCsrfToken(html: string): string | null {
  const match = html.match(/name="CSRFToken"\s+value="([^"]+)"/)
    || html.match(/CSRFToken["'\s:]+([a-f0-9-]{30,})/)
  return match?.[1] || null
}

// --- Slot parsing ---

const WEEKDAY_NAMES: Record<number, string> = {
  0: 'שני', 1: 'שלישי', 2: 'רביעי', 3: 'חמישי', 4: 'שישי', 5: 'שבת', 6: 'ראשון',
}

function parseSlotsResponse(raw: Record<string, any[]>): DeliveryDay[] {
  const days: DeliveryDay[] = []

  for (const [dateKey, daySlots] of Object.entries(raw).sort()) {
    if (!daySlots?.length) continue
    const first = daySlots[0]
    const fromStr: string = first.fromHourString || ''
    let dayName = ''
    let dateStr = dateKey

    try {
      const datePart = fromStr.split(' ')[0] // "2026/04/06"
      const dt = new Date(datePart.replace(/\//g, '-'))
      dayName = WEEKDAY_NAMES[dt.getDay() === 0 ? 6 : dt.getDay() - 1] || ''
      dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`
    } catch { /* use dateKey */ }

    const slots: DeliverySlot[] = daySlots
      .filter((s: any) => s.selectable)
      .map((s: any) => {
        const slotFrom: string = s.fromHourString || ''
        return {
          day: dayName,
          date: dateStr,
          time: slotFrom.includes(' ') ? slotFrom.split(' ').pop()! : '',
          price: s.price?.formattedValue || '',
          code: s.code,
        }
      })

    if (slots.length > 0) days.push({ day: dayName, date: dateStr, slots })
  }

  return days
}

/** Resolve "מחר"/"היום" to DD/MM, or extract DD/MM from DD/MM/YYYY. */
function resolveDayToDate(day: string): string | null {
  const now = new Date()
  if (day === 'מחר' || day === 'tomorrow') {
    const d = new Date(now); d.setDate(now.getDate() + 1)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  if (day === 'היום' || day === 'today') {
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  const ddmm = day.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{4})?$/)
  if (ddmm) return `${ddmm[1].padStart(2, '0')}/${ddmm[2].padStart(2, '0')}`
  return null
}

function findMatchingSlot(
  raw: Record<string, any[]>,
  day?: string,
  time?: string,
  nearest?: boolean,
): DeliverySlot | null {
  const allDays = parseSlotsResponse(raw)
  const resolvedDate = day ? resolveDayToDate(day) : null

  for (const d of allDays) {
    if (day && !nearest) {
      const matchByDate = resolvedDate ? d.date === resolvedDate : false
      const matchByName = d.day.includes(day)
      if (!matchByDate && !matchByName) continue
    }
    for (const s of d.slots) {
      if (time && s.time !== time && !nearest) continue
      return s
    }
  }

  return null
}
