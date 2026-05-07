/**
 * Retalix (Rexail API) HTTP client — ported from Python (~/develop/claw/projects/Retalix).
 * Pure REST API, no browser automation.
 *
 * Auth: SMS OTP → tarfash token header.
 * Session stored in Firestore groceries/{uid}/stores/retalix/private/credentials.
 * Catalog cached in Firestore groceries/{uid}/stores/retalix/private/catalog.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { gunzipSync } from 'zlib'
import type { RetalixStoreConfig, OtpStorePlugin, StoreSearchResult, StoreCheckoutResult, StoreOrder, StoreOrderItem, StoreSlotDay, CheckoutItem, CheckoutOptions, OrderModification, OrderModificationResult } from './storeTypes'

// Default config for Makor Hashefa
const DEFAULT_CONFIG: RetalixStoreConfig = {
  siteOrigin: 'https://www.makorhashefa.co.il',
  apiBase: 'https://client-il.rexail.com/client',
  deviceId: '96b94189f7353d93283bf995265b5737',
  xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..Fd0IKxSrb6gyMYWl9-qHPg.WSJZnBSChp-7D5pYeQquVKjZeJFhEFzCJ-IhvfBDBmcg19uvWecP2vIieRGGu0nOzAaE11WxQCTI3zdhIqNaTNCJ3fMFCQDCmztsqs1VE_asLSV375uK1qYdL6uquuuF.9jmt8tegsAQI0rfz6O4A8w',
  storeId: 180,
  deliveryAreaId: 10038,
  deliveryMethod: 'deliveryByStore',
  preferredDay: 'thursday',
  preferredHour: 18,
}

// --- Types ---

export interface RetalixCredentials {
  phone: string
  token: string | null
  config: RetalixStoreConfig
  verified: boolean
  otpPending?: boolean
}

export interface RetalixProduct {
  id: number
  name: string
  fullName: string
  price: number
  originalPrice?: number
  category: string
  parentCategory: string
  unit: string
  unitId: number | null
  sellingUnitId: number | null
  sellingUnits: { sellingUnitId: number; unitName: string; unitId: number }[]
  soldByWeight: boolean
  image: string
}

export interface RetalixSearchResult {
  productId: string
  name: string
  brand: string
  price: string
  unitPrice: string
  sellingUnitId: number
}

export interface RetalixSlot {
  date: string       // YYYY-MM-DD
  hour: number       // 0-23
  dayName: string    // "thursday"
  dayHebrew: string  // "יום חמישי"
}

export interface RetalixOrderResult {
  success: boolean
  orderId?: string
  deliveryWindow?: { day: string; date: string; time: string }
  error?: string
  dryRun?: boolean
}

// --- HTTP helpers ---

function commonHeaders(config: RetalixStoreConfig, token?: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'he',
    'content-type': 'application/json',
    'device-id': config.deviceId,
    'origin': config.siteOrigin,
    'referer': `${config.siteOrigin}/`,
    'x-source-platform': 'Retailer-Website',
    'x-website': config.xWebsite,
    'accept-encoding': 'gzip',
  }
  if (token) h['tarfash'] = token
  return h
}

async function rexailFetch(
  config: RetalixStoreConfig,
  path: string,
  options: { method?: string; body?: string; token?: string | null; form?: boolean } = {},
): Promise<any> {
  const url = `${config.apiBase}/${path}`
  const headers = commonHeaders(config, options.token)
  if (options.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded'
  }

  const resp = await fetch(url, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body || undefined,
  })

  const buf = Buffer.from(await resp.arrayBuffer())
  // Check gzip magic bytes
  const data = buf[0] === 0x1f && buf[1] === 0x8b
    ? gunzipSync(buf).toString('utf-8')
    : buf.toString('utf-8')

  try {
    return JSON.parse(data)
  } catch {
    console.error(`[Retalix] Non-JSON response from ${path}: ${data.slice(0, 200)}`)
    throw new Error(`Non-JSON response from ${path}`)
  }
}

// --- Credentials (Firestore) ---

function credRef(uid: string) {
  return getAdminFirestore().collection('groceries').doc(uid)
    .collection('stores').doc('retalix')
    .collection('private').doc('credentials')
}

function catalogRef(uid: string) {
  return getAdminFirestore().collection('groceries').doc(uid)
    .collection('stores').doc('retalix')
    .collection('private').doc('catalog')
}

export async function loadCredentials(uid: string): Promise<RetalixCredentials | null> {
  const doc = await credRef(uid).get()
  if (!doc.exists) return null
  return doc.data() as RetalixCredentials
}

export async function saveRetalixCredentials(uid: string, phone: string, config?: Partial<RetalixStoreConfig>): Promise<void> {
  const cred: RetalixCredentials = {
    phone,
    token: null,
    config: { ...DEFAULT_CONFIG, ...config },
    verified: false,
    otpPending: false,
  }
  await credRef(uid).set(cred)
}

export async function isRetalixAuthenticated(uid: string): Promise<boolean> {
  const cred = await loadCredentials(uid)
  return !!cred?.verified && !!cred?.token
}

export async function hasRetalixCredentials(uid: string): Promise<boolean> {
  const doc = await credRef(uid).get()
  return doc.exists
}

// --- Auth (OTP) ---

export async function sendOtp(uid: string): Promise<void> {
  const cred = await loadCredentials(uid)
  if (!cred) throw new Error('Retalix credentials not configured')

  const resp = await rexailFetch(cred.config, 'apply-for-authentication', {
    body: JSON.stringify({ cellPhone: cred.phone }),
  })

  if (!resp.success) {
    throw new Error(`OTP failed: ${resp.resolvedMessage || resp.message || 'unknown'}`)
  }

  await credRef(uid).update({ otpPending: true })
  console.log(`[Retalix] OTP sent to ${cred.phone}`)
}

export async function verifyOtp(uid: string, otp: string): Promise<string> {
  const cred = await loadCredentials(uid)
  if (!cred) throw new Error('Retalix credentials not configured')

  const resp = await rexailFetch(cred.config, 'authenticate', {
    body: JSON.stringify({
      authToken: otp,
      cellPhone: cred.phone,
      deviceId: cred.config.deviceId,
    }),
  })

  if (!resp.success) {
    throw new Error(`OTP verify failed: ${resp.resolvedMessage || resp.message || 'invalid code'}`)
  }

  const token = resp.data?.second
  if (!token) throw new Error('No token in OTP response')

  await credRef(uid).update({ token, verified: true, otpPending: false })
  console.log(`[Retalix] OTP verified for uid=${uid}`)
  return token
}

async function getToken(uid: string): Promise<{ token: string; config: RetalixStoreConfig }> {
  const cred = await loadCredentials(uid)
  if (!cred?.token) throw new Error('Retalix not authenticated. Send OTP first.')
  return { token: cred.token, config: cred.config }
}

// --- Catalog ---

export async function fetchCatalog(uid: string): Promise<RetalixProduct[]> {
  const { token, config } = await getToken(uid)

  const resp = await rexailFetch(config, 'public/store/catalog', {
    token,
  })

  if (!resp.success) throw new Error(`Catalog fetch failed: ${resp.resolvedMessage || resp.message}`)

  const products: RetalixProduct[] = resp.data.map((item: any) => {
    const product = item.product || {}
    const category = item.productCategory || {}
    const parentCat = category.parent || {}
    const sellingUnits = (item.productSellingUnits || []).map((su: any) => ({
      sellingUnitId: su.id,
      unitName: su.sellingUnit?.name || '',
      unitId: su.sellingUnit?.id || 0,
    }))
    const defaultUnit = sellingUnits[0] || {}

    return {
      id: item.id,
      name: (product.name || '').replace(/\n/g, ' '),
      fullName: (item.fullName || '').replace(/\n/g, ' '),
      price: item.price,
      originalPrice: item.originalPrice,
      category: category.name || '',
      parentCategory: parentCat.name || '',
      unit: defaultUnit.unitName || '',
      unitId: defaultUnit.unitId || null,
      sellingUnitId: defaultUnit.sellingUnitId || null,
      sellingUnits,
      soldByWeight: item.soldByWeight || false,
      image: item.imageUrl || '',
    }
  })

  // Cache in Firestore
  await catalogRef(uid).set({ products, fetchedAt: new Date().toISOString() })
  console.log(`[Retalix] Fetched ${products.length} products`)
  return products
}

async function loadCatalog(uid: string): Promise<RetalixProduct[]> {
  const doc = await catalogRef(uid).get()
  if (doc.exists) {
    const data = doc.data()!
    // Refresh if older than 24h
    const fetchedAt = new Date(data.fetchedAt).getTime()
    if (Date.now() - fetchedAt < 24 * 60 * 60 * 1000) {
      return data.products as RetalixProduct[]
    }
  }
  return fetchCatalog(uid)
}

export async function searchCatalog(uid: string, query: string): Promise<RetalixSearchResult[]> {
  const products = await loadCatalog(uid)
  const q = query.toLowerCase()

  const nameMatch = products.filter(p =>
    `${p.name} ${p.fullName}`.toLowerCase().includes(q)
  )
  // Exact category match first, then partial
  const exactCatMatch = products.filter(p => p.category.toLowerCase() === q)
  const partialCatMatch = products.filter(p =>
    p.category.toLowerCase().includes(q) || p.parentCategory.toLowerCase().includes(q)
  )
  const categoryMatch = exactCatMatch.length > 0 ? exactCatMatch : partialCatMatch

  // Use category matches when they significantly outnumber name matches (broad query)
  const matches = categoryMatch.length > nameMatch.length * 2 ? categoryMatch : nameMatch.length > 0 ? nameMatch : categoryMatch
  matches.sort((a, b) => (a.price || 999) - (b.price || 999))

  return matches.slice(0, 20).map(p => {
    // Prefer kg selling unit for weight products
    const kgUnit = p.sellingUnits.find(u => u.unitName === 'ק"ג')
    const bestUnit = p.soldByWeight && kgUnit ? kgUnit : p.sellingUnits[0]
    return {
      productId: String(p.id),
      name: p.fullName || p.name,
      brand: p.category,
      price: String(p.price || ''),
      unitPrice: `${p.price} ₪/${bestUnit?.unitName || p.unit}`,
      sellingUnitId: bestUnit?.sellingUnitId || p.sellingUnitId || 0,
    }
  })
}

/** Resolve sellingUnitId for a product by its catalog ID. Uses cached catalog. */
export async function resolveSellingUnitId(uid: string, productId: number): Promise<number> {
  const products = await loadCatalog(uid)
  const product = products.find(p => p.id === productId)
  if (!product) return 0
  const kgUnit = product.sellingUnits.find(u => u.unitName === 'ק"ג')
  const bestUnit = product.soldByWeight && kgUnit ? kgUnit : product.sellingUnits[0]
  return bestUnit?.sellingUnitId || product.sellingUnitId || 0
}

// --- Day name conversion ---

const HEB_TO_EN: Record<string, string> = {
  'ראשון': 'sunday', 'שני': 'monday', 'שלישי': 'tuesday',
  'רביעי': 'wednesday', 'חמישי': 'thursday', 'שישי': 'friday', 'שבת': 'saturday',
}
const EN_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function toEnglishDay(day: string): string | undefined {
  const lower = day.trim().toLowerCase()
  if (lower === 'today' || lower === 'היום') return EN_DAYS[new Date().getDay()]
  if (lower === 'tomorrow' || lower === 'מחר') return EN_DAYS[(new Date().getDay() + 1) % 7]
  if (HEB_TO_EN[day.trim()]) return HEB_TO_EN[day.trim()]
  if (EN_DAYS.includes(lower)) return lower
  return undefined
}

// --- Delivery Slots ---

export async function getSlots(uid: string, dayName?: string): Promise<RetalixSlot[]> {
  const { token, config } = await getToken(uid)

  const resp = await rexailFetch(config,
    `client/stores/store-available-service-areas?storeId=${config.storeId}&allServiceHours=false`,
    { token },
  )

  if (!resp.success) throw new Error(`Slots failed: ${resp.resolvedMessage}`)

  const areas = resp.data?.availableDeliveryAreas?.data || []
  const area = areas.find((a: any) => a.serviceArea?.id === config.deliveryAreaId)
  if (!area) throw new Error(`Delivery area ${config.deliveryAreaId} not found`)

  let slots: any[] = area.availableHours || []
  if (dayName) slots = slots.filter((s: any) => s.dayOfWeek?.name === dayName)

  return slots.map((s: any) => ({
    date: s.date,
    hour: s.openHour,
    dayName: s.dayOfWeek?.name || '',
    dayHebrew: s.dayOfWeek?.resolvedName || '',
  }))
}

// --- Order Flow ---

export async function saveDrafts(uid: string, items: { id: number; qty: number; sellingUnitId: number }[]): Promise<void> {
  const { token, config } = await getToken(uid)
  const now = Date.now()

  const cartItems = items.map(item => ({
    storeProduct: { id: item.id },
    requestedQuantity: item.qty,
    requestedSellingUnit: { id: item.sellingUnitId },
    insertTime: now,
    updateTime: now,
    sourceEvent: 'mainPageDesktop',
  }))

  // content is a JSON string, not an object
  const resp = await rexailFetch(config, 'client/orders/drafts', {
    body: JSON.stringify({ content: JSON.stringify(cartItems) }),
    token,
  })

  if (!resp.success) throw new Error(`Save drafts failed: ${resp.resolvedMessage || resp.message}`)
  console.log(`[Retalix] Drafts saved: ${items.length} items`)
}

async function prepareOrder(uid: string, slot: RetalixSlot): Promise<string> {
  const { token, config } = await getToken(uid)

  const resp = await rexailFetch(config, 'client/orders/new/prepare-to-place-order', {
    body: JSON.stringify({
      orderType: 'delivery',
      storeServiceAreaId: config.deliveryAreaId,
      timeFrame: {
        openHour: slot.hour,
        date: slot.date,
        dayOfWeek: slot.dayName,
      },
      deliveryMethodType: config.deliveryMethod,
    }),
    token,
  })

  if (!resp.success) throw new Error(`Prepare order failed: ${resp.resolvedMessage}`)
  const orderToken = resp.data?.encryptedOrderToken
  if (!orderToken) throw new Error('No order token in prepare response')

  console.log(`[Retalix] Order prepared, min value: ₪${resp.data.orderMinTotalValue}`)
  return orderToken
}

async function getPaymentMethod(uid: string): Promise<string> {
  const { token, config } = await getToken(uid)

  const resp = await rexailFetch(config,
    `client/payments-methods/my-payment-options?storeId=${config.storeId}`,
    { token },
  )

  if (!resp.success) throw new Error(`Payment methods failed: ${resp.resolvedMessage}`)
  const methods = resp.data?.paymentMethods || []
  if (methods.length === 0) throw new Error('No saved payment methods')

  const pm = methods[0]
  console.log(`[Retalix] Payment: ${pm.creditCard?.name} ****${pm.fourLastDigits}`)
  return pm.id
}

export async function checkout(
  uid: string,
  items: { id: number; qty: number; sellingUnitId: number }[],
  options: { day?: string; hour?: number; dryRun?: boolean; nearest?: boolean } = {},
): Promise<RetalixOrderResult> {
  const { config } = await getToken(uid)

  // 1. Save drafts
  await saveDrafts(uid, items)

  // 2. Get delivery slot
  const rawDay = options.day || (options.nearest ? undefined : config.preferredDay)
  const preferredHour = options.hour || config.preferredHour

  // Check if rawDay is an exact date DD/MM/YYYY — filter by date, not day-of-week
  const exactDateMatch = rawDay?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  let slots: RetalixSlot[]
  let slotErrorSuffix = ''
  if (exactDateMatch) {
    const [, d, m, y] = exactDateMatch
    // Normalize to YYYY-MM-DD for comparison (API may return with/without leading zeros)
    const targetDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    const allSlots = await getSlots(uid)
    console.log(`[retalixClient] checkout exact date: rawDay=${rawDay} targetDate=${targetDate} allSlots[0].date=${allSlots[0]?.date}`)
    slots = allSlots.filter(s => {
      const m2 = s.date?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}` === targetDate
      return s.date === targetDate  // already YYYY-MM-DD
    })
    slotErrorSuffix = ` לתאריך ${rawDay}`
  } else {
    const dayName = rawDay ? (toEnglishDay(rawDay) ?? rawDay) : undefined
    slots = await getSlots(uid, dayName)
    slotErrorSuffix = dayName ? ` ליום ${dayName}` : ''
  }
  if (slots.length === 0) return { success: false, error: `אין משבצות משלוח${slotErrorSuffix}. נסה list_slots לראות מה זמין.` }

  const slot = slots.find(s => s.hour === preferredHour) || slots[0]
  const deliveryWindow = { day: slot.dayHebrew, date: slot.date, time: `${slot.hour}:00` }

  if (options.dryRun) {
    return { success: false, dryRun: true, deliveryWindow }
  }

  // 3. Prepare order (get encrypted token)
  const orderToken = await prepareOrder(uid, slot)

  // 4. Get payment method
  const paymentMethodId = await getPaymentMethod(uid)

  // 5. Place order
  const { token } = await getToken(uid)
  const now = Date.now()
  const cartItems = items.map(item => ({
    storeProduct: { id: item.id },
    requestedQuantity: item.qty,
    requestedSellingUnit: { id: item.sellingUnitId },
    insertTime: now,
    updateTime: now,
    sourceEvent: 'mainPageDesktop',
  }))

  console.log('[retalixClient] placeOrder items:', cartItems.map(c => ({ id: c.storeProduct.id, qty: c.requestedQuantity, sellingUnit: c.requestedSellingUnit.id })))
  const resp = await rexailFetch(config, 'client/orders/new/place-order', {
    body: JSON.stringify({
      paymentMethodType: 'creditCard',
      items: cartItems,
      comments: '',
      orderToken,
      numberOfCreditPayments: 1,
      courierTip: 0,
      paymentMethod: { id: paymentMethodId },
      externalDeliveryFees: 0,
      membershipJson: null,
    }),
    token,
  })

  if (!resp.success) {
    return { success: false, error: `Place order failed: ${resp.resolvedMessage || resp.message}`, deliveryWindow }
  }

  console.log(`[Retalix] Order placed!`, JSON.stringify(resp.data || resp, null, 2))
  // Retalix returns both `nonObfuscatedId` (human-readable order number, same
  // as what listOrders exposes) and `id`/`orderId` (an opaque base64url token).
  // Prefer the readable number — the token leaks into Telegram messages etc.
  const orderId =
    resp.data?.nonObfuscatedId ||
    resp.data?.orderId ||
    resp.data?.id ||
    resp.nonObfuscatedId ||
    resp.orderId
  return { success: true, orderId: orderId ? String(orderId) : undefined, deliveryWindow }
}

// --- Orders ---

export async function listOrders(uid: string): Promise<StoreOrder[]> {
  const { token, config } = await getToken(uid)

  const resp = await rexailFetch(config, 'client/orders/my-orders', { token })
  if (!resp.success) throw new Error(`List orders failed: ${resp.resolvedMessage}`)

  return (resp.data || [])
    .filter((o: any) => o.open)
    .map((o: any) => {
      const items = (o.items || []).map((i: any) => ({
        name: i.storeProduct?.name || i.storeProductFullName || '',
        qty: i.requestedQuantity || 1,
        price: i.price ? `${i.price}` : '',
      }))
      const [time, endTime] = (o.deliveryHour || '').split('-')
      return {
        orderId: String(o.nonObfuscatedId),
        status: o.status?.resolvedName || o.status?.name || '',
        total: `${o.cartEstimation || 0} ₪`,
        delivery: { date: o.deliveryDate || '', time: time || '', endTime },
        itemsCount: items.length,
        cancelable: !!o.open,
        items,
      }
    })
}

// --- Cancel ---

export async function cancelOrder(uid: string, orderId: string): Promise<boolean> {
  const { token, config } = await getToken(uid)

  const resp = await rexailFetch(config, 'client/orders/my-orders/cancel-order', {
    body: `orderId=${encodeURIComponent(orderId)}`,
    token,
    form: true,
  })

  console.log(`[Retalix] Cancel order ${orderId}: success=${resp.success}`)
  return !!resp.success
}

// --- Plugin export ---

export const retalixPlugin: OtpStorePlugin = {
  id: 'retalix',
  label: 'מקור השפע',
  keywords: ['מקור השפע', 'makor', 'retalix', 'rexail'],
  authType: 'otp',

  isAuthenticated: isRetalixAuthenticated,
  sendOtp: async (uid, phone) => {
    await saveRetalixCredentials(uid, phone)
    await sendOtp(uid)
  },
  verifyOtp,

  search: async (uid, query): Promise<StoreSearchResult[]> => searchCatalog(uid, query),

  checkout: async (uid, items: CheckoutItem[], options: CheckoutOptions): Promise<StoreCheckoutResult> => {
    // Resolve missing sellingUnitIds from cached catalog
    const retalixItems = await Promise.all(items.map(async i => {
      const id = parseInt(i.code, 10)
      const stored = i.sellingUnitId
      const resolved = await resolveSellingUnitId(uid, id)
      const sellingUnitId = stored || resolved
      console.log(`[retalixPlugin] checkout item id=${id} stored=${stored} resolved=${resolved} using=${sellingUnitId}`)
      return { id, qty: i.qty, sellingUnitId }
    }))
    const hour = options.hour || (options.time ? parseInt(options.time, 10) : undefined)
    return checkout(uid, retalixItems, { day: options.day, hour, dryRun: options.dryRun })
  },

  listOrders,

  cancelOrder,

  readOrderItems: async (_uid, _orderId): Promise<StoreOrderItem[]> => {
    throw new Error('Retalix: readOrderItems not implemented')
  },

  modifyOrder: async (_uid, _orderId, _changes: OrderModification): Promise<OrderModificationResult> => {
    throw new Error('Retalix: modifyOrder not implemented')
  },

  listSlots: async (uid): Promise<StoreSlotDay[]> => {
    const slots = await getSlots(uid)
    const byDate = new Map<string, StoreSlotDay>()
    for (const s of slots) {
      if (!byDate.has(s.date)) {
        byDate.set(s.date, { day: s.dayHebrew, date: s.date, slots: [] })
      }
      byDate.get(s.date)!.slots.push({ day: s.dayHebrew, date: s.date, time: `${s.hour}:00` })
    }
    return Array.from(byDate.values())
  },
}
