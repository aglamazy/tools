/**
 * mypips.app Firestore REST client — direct commit writes to carts/{cartId}.
 *
 * mypips.app has no custom REST API for cart/order placement: the site's Firebase
 * JS SDK writes directly to Firestore, gated only by Firestore security rules
 * (ownerId == request.auth.uid). This client reproduces those writes via the plain
 * Firestore REST `commit` endpoint instead of the WebChannel/gRPC-over-HTTP the
 * browser SDK uses — same auth, same result, no streaming/session state to manage.
 *
 * Cart document shape and the REST call shape below were captured live via Chrome
 * DevTools MCP against a real mypips.app account/cart on 2026-07-13 (mashtelatharoe
 * store). See the task description for the full capture notes.
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

/**
 * NOT IMPLEMENTED — deliberately.
 *
 * The final "place order" write (checkout step 4, תשלום ואישור) was never captured.
 * It is likely more than `finalized: true` on the cart doc — the task notes call out
 * a probable `me-west1-plantonic-eco.cloudfunctions.net` vendor-notification call
 * (payment here is a deferred manual phone call, not an immediate charge, per the
 * "confirm order" / paymentNotice message strings in get-store-data).
 *
 * Guessing this write is unacceptable: it would commit a real order with a real
 * vendor against a real user's account. Do not implement this by inference from the
 * cart-building shape above — capture the real network traffic for step 4 first
 * (supervised Chrome DevTools session against a real mypips.app account), then
 * replace this function.
 */
export async function placeOrder(_idToken: string, _cartId: string): Promise<never> {
  throw new Error(
    'mypipsClient.placeOrder() is not implemented: the final "place order" network call ' +
    '(checkout step 4) has not been captured yet. See app/services/grocery/mypipsClient.ts ' +
    'and the mypips cart/order task description for what to capture before implementing this.'
  )
}
