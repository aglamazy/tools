/**
 * Shufersal HTTP client — ported from Python (~/develop/claw/projects/shufersal/v2).
 * Pure HTTP, no browser automation.
 *
 * Session cookies stored in Firestore groceries/{uid}/session.
 * Credentials stored in Firestore groceries/{uid}/credentials (server-encrypted).
 */

import dns from 'dns'
import http from 'http'
import https from 'https'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import * as cheerio from 'cheerio'

// Shufersal's IPv6 endpoints are unreachable from some networks.
// Node's built-in fetch (undici) ignores dns.setDefaultResultOrder,
// so we use a custom https.Agent with IPv4-only lookup.
dns.setDefaultResultOrder('ipv4first')
const ipv4Agent = new https.Agent({
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, { family: 4 }, callback as any)
  },
})
// On Vercel, the custom agent may not work — fall back to default
const isVercel = !!process.env.VERCEL
const agent = isVercel ? undefined : ipv4Agent

const BASE_URL = 'https://www.shufersal.co.il/online/he'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'

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
}

// --- Cookie helpers ---

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
}

function parseCookiesFromHeaders(headers: Headers, existing: Record<string, string>): Record<string, string> {
  const updated = { ...existing }

  // getSetCookie() returns individual Set-Cookie headers (Node 18.14.1+)
  // Fallback to raw 'set-cookie' header if not available
  let setCookies: string[] = []
  if (typeof headers.getSetCookie === 'function') {
    setCookies = headers.getSetCookie()
  } else {
    const raw = headers.get('set-cookie')
    if (raw) setCookies = raw.split(/,(?=\s*\w+=)/)
  }

  for (const sc of setCookies) {
    const match = sc.match(/^\s*([^=]+)=([^;]*)/)
    if (match && match[2]) {
      updated[match[1].trim()] = match[2]
    }
  }
  return updated
}

// --- HTTP helpers ---

/** HTTP request using Node native https (bypasses undici IPv6 issue). */
function nodeRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ statusCode: number; setCookies: string[]; body: string; location: string | null }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers,
      agent,
      timeout: 30000,
    }, (res) => {
      // Extract individual Set-Cookie headers from rawHeaders (name/value pairs)
      const setCookies: string[] = []
      const rawH = res.rawHeaders
      for (let i = 0; i < rawH.length; i += 2) {
        if (rawH[i].toLowerCase() === 'set-cookie') {
          setCookies.push(rawH[i + 1])
        }
      }

      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          setCookies,
          body: Buffer.concat(chunks).toString('utf-8'),
          location: res.headers.location || null,
        })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
    if (options.body) req.write(options.body)
    req.end()
  })
}

interface ShuResponse {
  status: number
  text: () => string
  json: () => any
  ok: boolean
  headers: { get: (name: string) => string | null }
}

async function shuFetch(
  path: string,
  cookies: Record<string, string>,
  options: RequestInit = {},
): Promise<{ resp: ShuResponse; cookies: Record<string, string> }> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'he-IL,he;q=0.9',
    'Cookie': cookieHeader(cookies),
    ...(options.headers as Record<string, string> || {}),
  }

  const body = typeof options.body === 'string' ? options.body : undefined
  const raw = await nodeRequest(url, {
    method: (options.method as string) || 'GET',
    headers,
    body,
  })

  // Parse Set-Cookie headers
  const updatedCookies = { ...cookies }
  for (const sc of raw.setCookies) {
    const match = sc.match(/^\s*([^=]+)=([^;]*)/)
    if (match && match[2]) {
      updatedCookies[match[1].trim()] = match[2]
    }
  }

  const bodyText = raw.body
  const resp: ShuResponse = {
    status: raw.statusCode,
    ok: raw.statusCode >= 200 && raw.statusCode < 300,
    text: () => bodyText,
    json: () => JSON.parse(bodyText),
    headers: {
      get: (name: string) => name.toLowerCase() === 'location' ? raw.location : null,
    },
  }

  return { resp, cookies: updatedCookies }
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
  return doc.data() as ShufersalCredentials
}

export async function saveCredentials(uid: string, email: string, password: string): Promise<void> {
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('credentials').set({ email, password, verified: false })
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
  if (session) {
    // Verify session is still valid
    const valid = await checkSession(session.cookies)
    if (valid) return session.cookies
    console.log(`[Shufersal] Session expired for uid=${uid}, re-logging in`)
  }
  return login(uid)
}

export async function checkSession(cookies: Record<string, string>): Promise<boolean> {
  try {
    const { resp } = await shuFetch('/authentication/get-status-includes-otp', cookies)
    const text = resp.text()
    return resp.status === 200 && !text.toLowerCase().includes('anonymous')
  } catch {
    return false
  }
}

// --- Cart ---

export async function cartRead(uid: string): Promise<CartItem[]> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch('/cart/load?restoreCart=true', cookies)
  const html = resp.text()
  return parseCart(html)
}

export async function cartAdd(uid: string, productCode: string, qty = 1): Promise<void> {
  const cookies = await getAuthenticatedCookies(uid)
  const csrf = getCsrf(cookies)

  await shuFetch('/cart/add?cartContext[openFrom]=CART&cartContext[recommendationType]=REGULAR', cookies, {
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
}

export async function cartAddMany(
  uid: string,
  items: { code: string; qty: number }[],
): Promise<{ added: number; failed: { code: string; error: string }[] }> {
  const cookies = await getAuthenticatedCookies(uid)
  const csrf = getCsrf(cookies)
  let added = 0
  const failed: { code: string; error: string }[] = []

  for (const item of items) {
    try {
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
      // Update cookies from response (CSRF can rotate)
      Object.assign(cookies, updated)
      if (resp.ok) added++
      else failed.push({ code: item.code, error: `HTTP ${resp.status}` })
    } catch (err: unknown) {
      failed.push({ code: item.code, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // Save updated cookies
  await saveSession(uid, { cookies, updatedAt: new Date().toISOString() })
  return { added, failed }
}

export async function cartRemove(uid: string, entryNumber: string): Promise<void> {
  const cookies = await getAuthenticatedCookies(uid)

  // Get fresh CSRF from page
  const { resp: page, cookies: c1 } = await shuFetch('/cart/cartsummary', cookies)
  Object.assign(cookies, c1)
  const pageHtml = page.text()
  const csrf = extractCsrfToken(pageHtml) || getCsrf(cookies)

  const params = new URLSearchParams({
    entryNumber,
    qty: '0',
    sellingMethod: '',
    'cartContext[openFrom]': 'CART',
    'cartContext[recommendationType]': 'REGULAR',
    'cartContext[action]': 'remove',
  })

  await shuFetch(`/cart/update?${params}`, cookies, {
    method: 'POST',
    body: `quantity=0&CSRFToken=${csrf}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

// --- Search ---

export async function search(uid: string, query: string): Promise<SearchResult[]> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch(`/search?q=${encodeURIComponent(query)}`, cookies, {
    headers: { 'Accept': 'text/html' },
  })
  const html = resp.text()
  return parseSearchResults(html)
}

// --- Delivery slots ---

export async function listSlots(uid: string): Promise<DeliveryDay[]> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch('/timeSlot/preselection/getHomeDeliverySlots?amount=1.0', cookies)
  if (!resp.ok) throw new Error(`Failed to fetch slots: ${resp.status}`)

  const raw = resp.json() as Record<string, any[]>
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

  const cookies = await getAuthenticatedCookies(uid)
  const csrf = getCsrf(cookies)

  // === BUILD CART ===
  if (items.length > 0) {
    const result = await cartAddMany(uid, items)
    console.log(`[Shufersal] Cart built: ${result.added}/${items.length} items`)
    if (result.added === 0) {
      return { success: false, error: 'No items added to cart' }
    }
  }

  // === GET SLOTS ===
  const { resp: slotsResp } = await shuFetch(
    '/timeSlot/preselection/getHomeDeliverySlots?amount=1.0', cookies,
  )
  if (!slotsResp.ok) return { success: false, error: `Failed to fetch slots: ${slotsResp.status}` }

  const rawSlots = slotsResp.json() as Record<string, any[]>
  const slot = findMatchingSlot(rawSlots, options.day, options.time, options.nearest)
  if (!slot) return { success: false, error: 'No matching delivery slot found' }

  console.log(`[Shufersal] Selected slot: ${slot.day} ${slot.date} ${slot.time}`)

  // === SET SLOT ===
  await shuFetch('/timeSlot/preselection/postHomeDeliverySlot', cookies, {
    method: 'POST',
    body: JSON.stringify({
      homeDeliveryTimeSlot: { code: slot.code, sourceOfSupply: 'DIRECT' },
    }),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  })

  const deliveryWindow = { day: slot.day, date: slot.date, time: slot.time }

  if (options.dryRun) {
    return { success: false, dryRun: true, deliveryWindow }
  }

  // === CHECKOUT AUTH ===
  const { resp: authResp } = await shuFetch('/cart/checkout/auth', cookies, {
    method: 'POST',
    body: new URLSearchParams({
      j_username: creds.email,
      j_password: creds.password,
      redirect_url: `${BASE_URL}/miglog-checkout`,
      fail_url: '/login/?error=true',
      CSRFToken: csrf,
    }).toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })

  try {
    const authResult = authResp.json()
    if (!authResult.success) {
      return { success: false, error: 'Checkout auth failed', deliveryWindow }
    }
  } catch {
    return { success: false, error: `Checkout auth unexpected: ${authResp.status}`, deliveryWindow }
  }

  // === PLACE ORDER ===
  // Load checkout page (sets server-side state)
  await shuFetch('/miglog-checkout', cookies)
  // Place order
  const { resp: confirmResp } = await shuFetch('/miglog-confirmation', cookies)
  const confirmHtml = confirmResp.text()

  // Extract order ID (8-digit number)
  const orderMatch = confirmHtml.match(/(\d{8})/)
  let orderId = orderMatch?.[1] || null

  // Fallback: check orders API
  if (!orderId) {
    const { resp: ordersResp } = await shuFetch('/my-account/orders', cookies, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    try {
      const orders = ordersResp.json() as any
      const active = orders.activeOrders || []
      if (active.length > 0) orderId = active[0].code
    } catch { /* ignore */ }
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
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch('/my-account/orders', cookies, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  const data = resp.json() as any
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
  const text = resp.text()
  return text.trim().toLowerCase() === 'true'
}

export async function orderLoadToCart(uid: string, orderId: string): Promise<CartItem[]> {
  const cookies = await getAuthenticatedCookies(uid)
  const { resp } = await shuFetch(`/cart/cartFromOrder/${orderId}`, cookies)
  return parseCart(resp.text())
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
  $('article.miglog-prod[data-product-code]').each((_, el) => {
    const $el = $(el)
    items.push({
      catalogId: $el.attr('data-product-code') || '',
      name: $el.find('.miglog-prod-name').text().trim(),
      price: $el.find('.miglog-prod-totalPrize').text().trim(),
      qty: parseInt($el.find('input.js-qty-selector-input').attr('value') || '1', 10),
      entryNumber: $el.find('[data-entry-number]').attr('data-entry-number') || null,
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

    results.push({
      catalogId: code,
      name,
      brand,
      price: priceMatch?.[0] || '',
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
      .map((s: any) => ({
        day: dayName,
        date: dateStr,
        time: fromStr.includes(' ') ? fromStr.split(' ').pop()! : '',
        price: s.price?.formattedValue || '',
        code: s.code,
      }))

    if (slots.length > 0) days.push({ day: dayName, date: dateStr, slots })
  }

  return days
}

function findMatchingSlot(
  raw: Record<string, any[]>,
  day?: string,
  time?: string,
  nearest?: boolean,
): DeliverySlot | null {
  const allDays = parseSlotsResponse(raw)

  for (const d of allDays) {
    if (day && !d.day.includes(day) && !nearest) continue
    for (const s of d.slots) {
      if (time && s.time !== time && !nearest) continue
      return s
    }
  }

  return null
}
