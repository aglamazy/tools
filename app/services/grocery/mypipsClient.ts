/**
 * mypips.app Firestore REST client — direct commit writes to carts/{cartId},
 * plus the captured callable-function finalize step.
 *
 * mypips.app has no custom REST API for cart/order placement: the site's Firebase
 * JS SDK writes directly to Firestore, gated only by Firestore security rules
 * (ownerId == request.auth.uid). This client reproduces those writes via the plain
 * Firestore REST `commit` endpoint instead of the WebChannel/gRPC-over-HTTP the
 * browser SDK uses — same auth, same result, no streaming/session state to manage.
 *
 * The finalize step is a Firebase Callable Function captured live via Chrome DevTools
 * MCP against a real mypips.app account/cart on 2026-07-13 (mashtelatharoe store).
 *
 * Every function here takes the caller's Firebase ID token directly — this module
 * has no opinion on how that token is obtained (that's the mypips auth-client task).
 */

const PROJECT_ID = 'plantonic-eco'
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

// --- Types ---

export interface MypipsAddressDetails {
  city: string
  street_number: string
  apartment?: string
  floor?: string
  enterance?: string
  neighborhood?: string
  deliveryComment?: string
  code?: string
  geolocation?: { lat: number; lng: number }
  entranceGeo?: Record<string, unknown>
}

export interface MypipsOrderDetails {
  fullName: string
  phoneNumber: string
  email: string
  address: string
  addressDetails: MypipsAddressDetails
  reuseComment?: boolean
}

export type MypipsUnit = string  // e.g. 'kg', 'יחידה' — check the product doc's own `units` field

// --- Firestore REST value encoding ---
// https://firebase.google.com/docs/firestore/reference/rest/v1/Value

type FirestoreValue = Record<string, unknown>

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } }
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } }
  }
  throw new Error(`mypipsClient: cannot encode value of type ${typeof value} to a Firestore REST value`)
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue
    fields[key] = toFirestoreValue(value)
  }
  return fields
}

function cartDocName(cartId: string): string {
  return `projects/${PROJECT_ID}/databases/(default)/documents/carts/${cartId}`
}

interface FirestoreWrite {
  update: { name: string; fields: Record<string, FirestoreValue> }
  updateMask?: { fieldPaths: string[] }
  updateTransforms?: { fieldPath: string; setToServerValue: 'REQUEST_TIME' }[]
  currentDocument?: { exists: boolean }
}

interface FirestoreDocument {
  name: string
  fields?: Record<string, FirestoreValue>
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('stringValue' in value) return value.stringValue
  if ('arrayValue' in value) {
    const arrayValue = value.arrayValue as { values?: FirestoreValue[] } | undefined
    return (arrayValue?.values || []).map(fromFirestoreValue)
  }
  if ('mapValue' in value) {
    const mapValue = value.mapValue as { fields?: Record<string, FirestoreValue> } | undefined
    return fromFirestoreFields(mapValue?.fields || {})
  }
  if ('timestampValue' in value) return value.timestampValue
  if ('referenceValue' in value) return value.referenceValue
  if ('geoPointValue' in value) return value.geoPointValue
  if ('bytesValue' in value) return value.bytesValue
  throw new Error(`mypipsClient: cannot decode Firestore value ${JSON.stringify(value)}`)
}

function fromFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    out[key] = fromFirestoreValue(value)
  }
  return out
}

async function commit(idToken: string, writes: FirestoreWrite[]): Promise<unknown> {
  const res = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`mypips Firestore commit failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function fetchCartDoc(idToken: string, cartId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${FIRESTORE_BASE}/carts/${cartId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`mypips Firestore get cart failed (${res.status}): ${text}`)
  }
  const doc = await res.json() as FirestoreDocument
  const fields = fromFirestoreFields(doc.fields || {})
  return { id: cartId, ...fields }
}

async function callFinalizeOrder(payload: Record<string, unknown>, idToken: string): Promise<unknown> {
  const res = await fetch('https://me-west1-plantonic-eco.cloudfunctions.net/functionsOrdersFinalizeOrderNew', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: payload }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`mypips finalize-order callable failed (${res.status}): ${text}`)
  }
  return res.json()
}

function generatePipsId(): string {
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex}-${Date.now()}`
}

const TOUCH_TIMESTAMP: FirestoreWrite['updateTransforms'] = [
  { fieldPath: 'lastUpdatedAt', setToServerValue: 'REQUEST_TIME' },
]

/** Firestore client-generated auto-id: 20 chars from the SDK's push-id alphabet. */
export function generateCartId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 20; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return id
}

/**
 * Create a brand-new cart (blind create — currentDocument.exists: false matches the
 * captured write for a first add-to-cart on a store with no existing open cart).
 */
export async function createCart(idToken: string, ownerId: string, groupId: string, cartId: string = generateCartId()): Promise<string> {
  const accessibleUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await commit(idToken, [{
    update: {
      name: cartDocName(cartId),
      fields: toFirestoreFields({
        accessibleUntil,
        ownerId,
        groupId,
        finalized: false,
        delivered: false,
        shipped: false,
        paid: false,
        closed: false,
      }),
    },
    updateTransforms: [
      { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
      ...TOUCH_TIMESTAMP,
    ],
    currentDocument: { exists: false },
  }])
  return cartId
}

/**
 * Add (or overwrite the quantity of) a line item on an existing cart.
 *
 * Each product is a top-level field on the cart doc keyed by productId, not a
 * sub-array — so this is a field-masked merge write, not a full-document replace.
 * NOTE: the "merge into existing product field" path (as opposed to first-item
 * blind create) was not itself captured — the task's capture notes flag this as
 * "not yet confirmed". This follows standard Firestore REST field-mask semantics
 * (only listed fieldPaths are touched), which should be correct regardless.
 */
export async function addItem(idToken: string, cartId: string, productId: string, unit: MypipsUnit, qty: number): Promise<void> {
  await commit(idToken, [{
    update: {
      name: cartDocName(cartId),
      fields: toFirestoreFields({
        [productId]: { selectedUnits: unit, quantities: { [unit]: qty } },
      }),
    },
    updateMask: { fieldPaths: [productId] },
    updateTransforms: TOUCH_TIMESTAMP,
    currentDocument: { exists: true },
  }])
}

/**
 * Remove a line item. Per Firestore REST commit semantics, a field listed in
 * updateMask.fieldPaths but absent from `fields` is deleted from the document.
 */
export async function removeItem(idToken: string, cartId: string, productId: string): Promise<void> {
  await commit(idToken, [{
    update: {
      name: cartDocName(cartId),
      fields: {},
    },
    updateMask: { fieldPaths: [productId] },
    updateTransforms: TOUCH_TIMESTAMP,
    currentDocument: { exists: true },
  }])
}

/** Set/replace the delivery + contact details block on the cart. */
export async function updateOrderDetails(idToken: string, cartId: string, orderDetails: MypipsOrderDetails): Promise<void> {
  await commit(idToken, [{
    update: {
      name: cartDocName(cartId),
      fields: toFirestoreFields({ orderDetails }),
    },
    updateMask: { fieldPaths: ['orderDetails'] },
    updateTransforms: TOUCH_TIMESTAMP,
    currentDocument: { exists: true },
  }])
}

export async function placeOrder(idToken: string, cartId: string): Promise<unknown> {
  const cart = await fetchCartDoc(idToken, cartId)
  const orderDetails = (cart['orderDetails'] ?? null) as Record<string, unknown> | null
  const deliveryOption = (
    cart['deliveryOption'] ??
    (orderDetails ? (orderDetails['deliveryOption'] ?? null) : null) ??
    null
  ) as Record<string, unknown> | null
  const payload = {
    cartId,
    orderDetails,
    deliveryOption,
    shouldSendOrderConfirmation: true,
    shouldDeleteCard: false,
    guestOrder: false,
    passedIsManager: false,
    params: {
      cart,
      uid: cart['uid'] ?? cart['ownerId'] ?? null,
      groupId: cart['groupId'] ?? null,
      sum: cart['sum'] ?? null,
      vat: cart['vat'] ?? null,
      totalVatFreeSum: cart['totalVatFreeSum'] ?? null,
      lang: 'he',
      textToDisplay: 'הזמנה חדשה',
      action: 'suspended',
      type: 'user_checkout',
    },
    queryParams: {},
    referrer: '',
    pipsId: generatePipsId(),
    myppsinId: '',
    approveOwnershipTransfer: false,
  }
  return callFinalizeOrder(payload, idToken)
}
