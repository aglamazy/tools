/**
 * Store plugin interface — any grocery store implements this.
 * Telegram bot and cron dispatch through this interface,
 * never directly to a specific store client.
 */

export type StoreType = string  // e.g. 'shufersal', 'retalix'

// --- Plugin interface ---

export interface GroceryStorePlugin {
  /** Unique store identifier */
  id: StoreType
  /** Display name (Hebrew) */
  label: string
  /** Keywords the LLM uses to detect this store in conversation */
  keywords: string[]

  // --- Auth ---
  /** Auth method: 'credentials' (email+password) or 'otp' (phone+SMS) */
  authType: 'credentials' | 'otp'
  isAuthenticated(uid: string): Promise<boolean>

  // --- Search ---
  search(uid: string, query: string): Promise<StoreSearchResult[]>

  // --- Orders ---
  checkout(uid: string, items: CheckoutItem[], options: CheckoutOptions): Promise<StoreCheckoutResult>
  listOrders(uid: string): Promise<StoreOrder[]>
  cancelOrder(uid: string, orderId: string): Promise<boolean>

  // --- Existing-order editing (before cutoff) ---
  readOrderItems(uid: string, orderId: string): Promise<StoreOrderItem[]>
  modifyOrder(uid: string, orderId: string, changes: OrderModification): Promise<OrderModificationResult>

  // --- Slots ---
  listSlots(uid: string): Promise<StoreSlotDay[]>

  /**
   * List distinct product categories for the store. Returns Hebrew labels.
   * For Rexail-powered stores this comes from the cached catalog. Stores
   * that don't have a category concept return [].
   */
  listCategories(uid: string): Promise<string[]>
}

/** Optional OTP methods — only for stores with authType === 'otp' */
export interface OtpStorePlugin extends GroceryStorePlugin {
  authType: 'otp'
  sendOtp(uid: string, phone: string): Promise<void>
  verifyOtp(uid: string, otp: string): Promise<string>
}

/** Optional credentials methods — only for stores with authType === 'credentials' */
export interface CredentialsStorePlugin extends GroceryStorePlugin {
  authType: 'credentials'
  saveCredentials(uid: string, email: string, password: string): Promise<void>
  login(uid: string): Promise<void>
}

// --- Shared types ---

export interface CheckoutItem {
  code: string          // product ID (catalogId for Shufersal, numeric id for Retalix)
  qty: number
  sellingUnitId?: number  // Retalix: kg vs unit
}

export interface CheckoutOptions {
  day?: string
  time?: string
  hour?: number
  nearest?: boolean
  dryRun?: boolean
}

export interface StoreSearchResult {
  productId: string
  name: string
  brand: string
  price: string
  unitPrice: string
  sellingUnitId?: number
}

export interface StoreCheckoutResult {
  success: boolean
  orderId?: string
  deliveryWindow?: { day: string; date: string; time: string }
  error?: string
  dryRun?: boolean
}

export interface StoreOrder {
  orderId: string
  status: string
  total: string
  delivery: { date: string; time: string; endTime?: string }
  itemsCount: number
  cancelable: boolean
  items: { name: string; qty: number; price: string }[]
}

export interface StoreOrderItem {
  entryRef: string      // opaque ref used by modifyOrder.remove (e.g. Shufersal entryNumber)
  productId: string
  name: string
  qty: number
  price: string
}

export interface OrderModification {
  add?: { productId: string; qty: number }[]
  remove?: string[]     // entryRef or productId
  /** Change the delivery slot. Looked up via listSlots (day name + time). */
  slot?: { day: string; time: string }
}

export interface OrderModificationResult {
  added: number
  removed: number
  failed: { ref: string; error: string }[]
}

export interface StoreSlot {
  day: string
  date: string
  time: string
}

export interface StoreSlotDay {
  day: string
  date: string
  slots: StoreSlot[]
}

/** Per-store config stored in Firestore */
export interface RetalixStoreConfig {
  siteOrigin: string
  apiBase: string
  deviceId: string
  xWebsite: string
  storeId: number
  /** Optional — sourced from the user's account on first slot/checkout, not hardcoded. */
  deliveryAreaId?: number
  deliveryMethod: string
  preferredDay: string
  preferredHour: number
}
