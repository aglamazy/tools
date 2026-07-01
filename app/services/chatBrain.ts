/**
 * Aglamazo grocery chat agent — entry point.
 *
 * Replaces the legacy hand-rolled agentic loop with `agents-ai`'s `processChat`.
 * Channel-neutral: the same `processChatMessage` drives the in-app widget
 * (/api/chat), the Telegram webhook, and the test CLI. Channel adapters
 * translate their inbound shape into ChatBrainInput.
 */

import { processChat, type HistoryStore, type StoredMessage } from 'agents-ai'

// --- onEmptyTurn synthesis: Hebrew fallback when tools ran but the LLM didn't narrate. ---
// Picker case: enumerate options as a numbered list (no UI to click — text only).
// Other actions: one-liner per mutation. Empty string = "LLM was expected to narrate";
// if everything synth'd to empty, we emit a generic acknowledgement.

function formatHebrewPicker(sel: PendingProductSelection): string {
  const head = `חיפשתי "${sel.query}". בחר מספר:`
  const lines = sel.results.slice(0, 5).map((r, i) => {
    const price = r.unitPrice || r.price
    return `${i + 1}. ${r.name} — ${price}`
  })
  return [head, ...lines].join('\n')
}

function summarizeAction(name: string, args: Record<string, unknown>): string {
  const itemList = (k: string) => (Array.isArray(args[k]) ? (args[k] as string[]).join(', ') : '')
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '')
  switch (name) {
    // Cart / list mutations
    case 'search_product':
      return str('query') ? `חיפשתי "${str('query')}".` : 'חיפשתי מוצר.'
    case 're_search':
      return str('query') ? `חיפוש מחדש על "${str('query')}".` : 'חיפוש מחדש.'
    case 'product_details':
      return str('name') ? `פרטים על ${str('name')}.` : 'הצגתי פרטי מוצר.'
    case 'remove_items':
      return itemList('items') ? `הסרתי: ${itemList('items')}.` : 'הסרתי פריטים.'
    case 'remove_standing':
      return itemList('items') ? `הסרתי מהקבועה: ${itemList('items')}.` : 'הסרתי מהקבועה.'
    case 'move_to_standing':
      return itemList('items') ? `העברתי לקבועה: ${itemList('items')}.` : 'העברתי לקבועה.'
    case 'clear_pending':
      return 'ניקיתי את המתנה.'

    // Read-only views (tool already produced the visible content)
    case 'show_list':
      return 'הצגתי את הרשימה.'
    case 'show_cart':
      return 'הצגתי את העגלה.'
    case 'show_orders':
      return 'הצגתי הזמנות פתוחות.'
    case 'show_schedule':
      return 'הצגתי את לוח הזמנים.'
    case 'list_slots':
      return 'בדקתי משבצות משלוח.'
    case 'list_categories':
      return 'הצגתי קטגוריות.'
    case 'browse_category':
      return str('categoryName') || str('name') || str('category')
        ? `דפדפתי בקטגוריה "${str('categoryName') || str('name') || str('category')}".`
        : 'דפדפתי בקטגוריה.'

    // Order lifecycle
    case 'trigger_order':
      return 'פתחתי הזמנה.'
    case 'cancel_order':
      return 'ביטלתי את ההזמנה.'

    // Schedule
    case 'set_schedule':
      return 'קבעתי לוח זמנים.'

    // Auth / credentials — NEVER echo back the values
    case 'set_credentials':
      return 'שמרתי את פרטי ההתחברות.'
    case 'set_otp_phone':
      return 'שלחתי קוד SMS.'
    case 'verify_otp':
      return 'אימתתי את הקוד.'
    case 'grant_server_creds_consent':
      return 'אישרתי שמירה מוצפנת בשרת.'

    // Store config
    case 'set_default_store':
      return 'עדכנתי חנות ברירת מחדל.'

    // Tasks
    case 'create_task':
      return str('title') ? `יצרתי משימה: ${str('title')}.` : 'יצרתי משימה.'
    case 'list_tasks':
      return 'הצגתי משימות.'
    case 'complete_task':
      return 'סימנתי משימה כהושלמה.'
    case 'update_task':
      return 'עדכנתי משימה.'
    case 'delete_task':
      return 'מחקתי משימה.'

    // set_session is silent (handled by the tool's own replyText)
    case 'set_session':
    default:
      return ''
  }
}

function synthesizeHebrewFromTools(
  toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[],
): string {
  const summaries = toolCalls.map(c => summarizeAction(c.name, c.args)).filter(Boolean)
  return summaries.length ? summaries.join(' ') : ''
}

/**
 * First-word greeting detection (Hebrew + common English). A "שלום" on its
 * own — or with a follow-up clause — signals the user is starting a fresh
 * interaction. The greeting alone doesn't justify wiping chat history, but
 * leftover product-picker selections from a previous session would push a
 * stale "בחר מספר" back at them on the next turn. Soft-reset clears those.
 */
const GREETINGS = ['שלום', 'היי', 'הי', 'הלו', 'בוקר', 'ערב', 'צהריים', 'אהלן', 'hi', 'hello', 'hey']
export function isFirstWordGreeting(text: string): boolean {
  if (!text) return false
  const cleaned = text.trim().replace(/^[!?.,:;"'״׳`(]+/, '').trim().toLowerCase()
  if (!cleaned) return false
  const firstWord = cleaned.split(/\s+/)[0]
  return GREETINGS.includes(firstWord)
}

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { buildContextBlock, SYSTEM_PROMPT, type UserContext } from '@/app/services/chat/chatProcessor'
import { savePendingSearch, clearAllPendingSearches, type PendingProductSelection, type AnonStoreCreds } from '@/app/services/chat/actionExecutor'
import { getUserStores, getStoreData, setOpenOrderCache } from '@/app/services/grocery/groceryStoreMulti'
import { getAllStores } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'
import { isCredentialsVerified } from '@/app/services/grocery/shufersalClient'
import { getAnyStoredOtpPhone } from '@/app/services/grocery/retalixClient'
import { REXAIL_STORES } from '@/app/services/grocery/rexailStores'
import { listTasks } from '@/app/services/taskFirestoreService'
import { getServerCredsConsent, hasCurrentServerCredsConsent } from '@/app/services/consentService'
import {
  ANON_PREFIX,
  createChatHistoryStore,
  isAnonUid,
  type SessionState,
} from '@/app/services/chat/history'
import { createAglamazoLLMClient } from '@/app/services/chat/client'
import { createAglamazoToolRegistry, type AglamazoToolContext } from '@/app/services/chat/toolRegistry'

export { ANON_PREFIX, isAnonUid }
export type { SessionState }

export interface ChatBrainInput {
  uid: string
  text: string
  displayName?: string
  historyCollection: string
  includeTasks?: boolean
  /** Unused since the retry ladder was dropped on agents-ai adoption. Kept for
   *  call-site signature compat; safe to remove once all sites stop passing it. */
  onStatus?: (msg: string) => Promise<void>
  seedHistory?: StoredMessage[]
  anonStoreCreds?: AnonStoreCreds | null
}

export interface ChatBrainResult {
  reply: string
  thinking?: string
  actions: { action: string; [key: string]: unknown }[]
  pendingSelections?: (PendingProductSelection & { searchKey: string })[]
  llmExhausted?: boolean
  upstreamError?: string
  anonStoreCreds?: AnonStoreCreds | null
}

// --- Context builder (per-turn server state injected into the system prompt) ---

async function buildContext(uid: string, displayName?: string, includeTasks = false, session?: SessionState): Promise<UserContext> {
  const siteByStoreId = new Map<string, string>()
  const descByStoreId = new Map<string, string>()
  for (const e of REXAIL_STORES) {
    siteByStoreId.set(e.id, e.siteOrigin)
    descByStoreId.set(e.id, e.description)
  }
  descByStoreId.set('shufersal', 'סופרמרקט כללי — מזון, משקאות, ניקיון, תינוקות, וכו׳')

  if (isAnonUid(uid)) {
    return {
      displayName,
      currentTier: 'tier-1',
      stores: getAllStores().map(s => ({
        id: s.id,
        label: s.label,
        connected: false,
        siteOrigin: siteByStoreId.get(s.id),
        description: descByStoreId.get(s.id),
      })),
      defaultStore: 'shufersal',
      session,
      tasks: undefined,
      hasCredentials: false,
    }
  }

  const [hasCreds, userStores, tasks, consent] = await Promise.all([
    isCredentialsVerified(uid).catch(() => false),
    getUserStores(uid).catch(() => ({ activeStores: [] as string[], defaultStore: 'shufersal' })),
    includeTasks ? listTasks(uid).catch(() => []) : Promise.resolve(undefined),
    getServerCredsConsent(uid).catch(() => null),
  ])

  // Tier 3 only: look up a stored OTP phone from any connected OTP store.
  // Tier 2 phones live in the browser — server can't read them.
  const storedOtpPhoneEntry = consent?.acceptedAt
    ? await getAnyStoredOtpPhone(uid).catch(() => null)
    : null

  const storeContexts = await Promise.all(
    getAllStores().map(async (store) => {
      const connected = await store.isAuthenticated(uid).catch(() => false)
      const storeData = await getStoreData(uid, store.id).catch(() => null)
      return {
        id: store.id,
        label: store.label,
        connected,
        siteOrigin: siteByStoreId.get(store.id),
        description: descByStoreId.get(store.id),
        standingList: storeData?.standingList ? Object.values(storeData.standingList).map(i => ({ name: i.name, qty: i.qty, unit: i.unit })) : undefined,
        pendingChanges: storeData ? {
          add: Object.values(storeData.pendingChanges.add).map(e => ({
            name: e.item.name,
            qty: e.item.qty,
            unit: e.item.unit,
            ...(e.validTo ? { validTo: e.validTo } : {}),
          })),
          remove: Object.values(storeData.pendingChanges.remove).map(e => ({
            name: e.name,
            ...(e.validTo ? { validTo: e.validTo } : {}),
          })),
        } : undefined,
        schedule: storeData?.schedule,
        // Cached open-order snapshot (SSOT = the store, refreshed fire-and-forget
        // each turn). Lights up the "הזמנה פתוחה" branch of the system prompt so
        // the agent knows it's editing an open order vs building a future list —
        // with no user hint. null status → undefined (no open order).
        orderStatus: storeData?.openOrder?.status ?? undefined,
        orderId: storeData?.openOrder?.orderId ?? undefined,
      }
    }),
  )

  return {
    displayName,
    currentTier: consent?.acceptedAt ? 'tier-3' : 'tier-2',
    stores: storeContexts,
    defaultStore: userStores.defaultStore,
    session,
    tasks: tasks || undefined,
    hasCredentials: hasCreds,
    serverCredsConsent: consent,
    storedOtpPhone: storedOtpPhoneEntry
      ? { masked: `...${storedOtpPhoneEntry.phone.slice(-4)}` }
      : undefined,
  }
}

/**
 * Refresh the cached open-order snapshot for every store this user is connected
 * to. The store is the SSOT, but querying it needs a login (slow), so this is
 * meant to run FIRE-AND-FORGET in parallel with the LLM call (see the chat
 * route): it never blocks the reply, and the fresh snapshot is read on the NEXT
 * turn. Always resolves — every per-store failure is swallowed and logged — so
 * it's safe to hand to `after()` without an unhandled rejection.
 *
 * Anon (Tier-1) users are skipped: nothing about them is persisted server-side,
 * and the server has no creds to query the store on their behalf.
 */
export async function refreshOpenOrderCaches(uid: string): Promise<void> {
  if (isAnonUid(uid)) return
  await Promise.all(getAllStores().map(async (store) => {
    try {
      if (!(await store.isAuthenticated(uid).catch(() => false))) return
      const orders = await store.listOrders(uid)
      const open = orders.find(o => o.cancelable) || null
      await setOpenOrderCache(uid, store.id, {
        orderId: open?.orderId ?? null,
        status: open ? 'active' : null,
        fetchedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.warn(`[openOrderCache] uid=${uid} store=${store.id} refresh failed:`, err)
    }
  }))
}

// --- One-shot resets exposed to /api/chat/reset and /api/chat/clear-list ---

export async function handleReset(collection: string, uid: string): Promise<void> {
  if (isAnonUid(uid)) return
  await getAdminFirestore().collection(collection).doc(uid).set({
    messages: [],
    session: {},
    updatedAt: new Date().toISOString(),
  })
}

export async function handleClear(uid: string): Promise<void> {
  const firestore = getAdminFirestore()
  const doc = await firestore.collection('groceries').doc(uid).get()
  if (doc.exists) {
    await firestore.collection('groceries').doc(uid).update({
      standingList: {},
      pendingChanges: { add: {}, remove: {} },
      updatedAt: new Date().toISOString(),
    })
  }
}

// --- Main entry ---

export async function processChatMessage(input: ChatBrainInput): Promise<ChatBrainResult> {
  initStores()

  const { uid, text, displayName, historyCollection, includeTasks, seedHistory, anonStoreCreds } = input

  // Greeting soft-reset: a first-word שלום/היי/בוקר/etc. signals the user is
  // starting fresh. Wipe leftover product-picker selections so the next turn
  // doesn't surface a stale "בחר מספר" from yesterday. Chat messages and the
  // weekly cart (pendingChanges) are NOT touched — those are deliberate state.
  if (!isAnonUid(uid) && isFirstWordGreeting(text)) {
    try {
      await clearAllPendingSearches(uid)
    } catch (err) {
      console.warn('[ChatBrain] clearAllPendingSearches failed (greeting soft-reset):', err)
    }
  }

  // Shared session — mutated by `set_session` tool, persisted on history.save.
  const session: SessionState = {}

  // C01 same-turn consent defense: snapshot Tier-3 consent ONCE, before any
  // tool runs this turn. The dispatcher calls executeActions per-tool-call, so
  // this turn-start value (not a per-call re-read) is what gates set_credentials/
  // set_otp_phone — a bundled grant+save in one turn therefore can't self-authorize.
  // Firestore read failure defaults to false (safe: blocks Tier-3 ops, never grants).
  // A throw here (uncaught) was the root cause of service ticket #1 (saliko 2026-06-28).
  const consentExistedAtTurnStart = !isAnonUid(uid) && (await hasCurrentServerCredsConsent(uid).catch(() => false))

  // Tool context — shared mutable state across all tool calls in the turn.
  const toolCtx: AglamazoToolContext = {
    uid,
    session,
    anonStoreCreds: anonStoreCreds ?? null,
    anonCredsTouched: false,
    pendingSelections: [],
    consentExistedAtTurnStart,
  }

  // History store wraps the Firestore implementation but honors anon seedHistory.
  // Crucially, the returned session is the SAME reference as `session` above so
  // tool mutations to activeStore land on the object processChat persists.
  const baseStore = createChatHistoryStore(historyCollection)
  const history: HistoryStore<SessionState> = {
    async load(conversationId) {
      const loaded = await baseStore.load(conversationId)
      const messages =
        isAnonUid(conversationId) && seedHistory?.length
          ? seedHistory.slice(-20)
          : loaded.messages
      Object.assign(session, loaded.session ?? {})
      return { messages, session }
    },
    save: baseStore.save,
  }

  const { declarations, dispatch } = createAglamazoToolRegistry()
  const client = createAglamazoLLMClient()

  const result = await processChat<SessionState, AglamazoToolContext>({
    conversationId: uid,
    userText: text,
    client,
    systemPrompt: async (s) => {
      const ctx = await buildContext(uid, displayName, includeTasks, s)
      return `${SYSTEM_PROMPT}\n\n## מצב נוכחי\n${buildContextBlock(ctx)}`
    },
    tools: declarations,
    dispatch,
    toolContext: toolCtx,
    history,
    maxSteps: 5,
    maxHistory: 10,
    logger: console,
    onEmptyTurn: ({ hadToolCalls, toolCalls }) => {
      if (toolCtx.pendingSelections.length > 0) {
        return formatHebrewPicker(toolCtx.pendingSelections[0])
      }
      if (!hadToolCalls) {
        return 'לא הבנתי. תוכל לנסח אחרת?'
      }
      return synthesizeHebrewFromTools(toolCalls) || 'בוצע.'
    },
  })

  // Persist pending searches separately (Firestore subcollection) so the
  // callback flow can look them up by their generated 6-char key.
  let selectionsWithKeys: ChatBrainResult['pendingSelections']
  if (toolCtx.pendingSelections.length) {
    selectionsWithKeys = await Promise.all(
      toolCtx.pendingSelections.map(async (sel) => {
        const searchKey = await savePendingSearch(uid, sel)
        return { ...sel, searchKey }
      }),
    )
  }

  // When a picker is pending but processChat got only a stray status string
  // ("ok", "...") as the LLM's incidental preamble alongside the tool call,
  // override with the proper Hebrew picker prompt so no noise bubble appears.
  let effectiveReply = result.reply
  if (
    toolCtx.pendingSelections.length > 0 &&
    (!effectiveReply || effectiveReply === 'ok' || effectiveReply === '...')
  ) {
    effectiveReply = formatHebrewPicker(toolCtx.pendingSelections[0])
  }

  return {
    reply: effectiveReply,
    thinking: result.thinking,
    actions: result.toolCalls.map((c) => ({ action: c.name, ...c.args })),
    pendingSelections: selectionsWithKeys,
    llmExhausted: false,
    upstreamError: undefined,
    anonStoreCreds: toolCtx.anonCredsTouched ? (toolCtx.anonStoreCreds ?? null) : undefined,
  }
}
