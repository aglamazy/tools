/**
 * Shared chat brain — single processing pipeline used by all channels
 * (Telegram webhook, in-app chat widget, test CLI).
 *
 * Handles: history management, session state, context building, LLM call,
 * action execution, auto-continue for info-gathering actions, pending search persistence.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { processChat, type ChatMessage, type ChatStatusReporter, type UserContext } from '@/app/services/telegram/chatProcessor'
import { executeActions, savePendingSearch, type PendingProductSelection, type AnonStoreCreds } from '@/app/services/telegram/actionExecutor'
import { getUserStores, getStoreData } from '@/app/services/grocery/groceryStoreMulti'
import { getAllStores } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'
import { isCredentialsVerified } from '@/app/services/grocery/shufersalClient'
import { REXAIL_STORES } from '@/app/services/grocery/rexailStores'
import { listTasks } from '@/app/services/taskFirestoreService'
import { getServerCredsConsent } from '@/app/services/consentService'
import type { LLMMessage } from '@/app/services/llm/types'

const MAX_HISTORY = 10

/**
 * Anon-uid prefix for visitor sessions. Routes that hit chatBrain without
 * a real Firebase uid generate `anon:<sessionId>` and pass it through —
 * the brain treats anon ids as ephemeral (no Firestore reads/writes for
 * chat history, no auth-required tools).
 */
export const ANON_PREFIX = 'anon:'
export function isAnonUid(uid: string): boolean { return uid.startsWith(ANON_PREFIX) }

export interface SessionState {
  activeStore?: string | null
}

export interface ChatBrainInput {
  uid: string
  text: string
  displayName?: string
  historyCollection: string
  includeTasks?: boolean
  /** Optional progress notifier used by the LLM recovery ladder. */
  onStatus?: ChatStatusReporter
  /**
   * Optional client-supplied conversation history. Used for anon visitors
   * whose threads aren't persisted server-side — the client (Dexie) holds
   * the truth and re-sends recent turns with each request so the LLM has
   * context. Ignored for authed uids (Firestore is authoritative).
   */
  seedHistory?: ChatMessage[]
  /**
   * Anon Tier-1 credential state from the client's sessionStorage. Server
   * reads it in-memory only — never persisted. Pass-through to executeActions,
   * which may mutate it (set_otp_phone, verify_otp, trigger_order) and return
   * the new value for the client to write back.
   */
  anonStoreCreds?: AnonStoreCreds | null
}

export interface ChatBrainResult {
  reply: string
  thinking?: string
  actions: { action: string; [key: string]: unknown }[]
  pendingSelections?: (PendingProductSelection & { searchKey: string })[]
  /** True when the LLM gave up after the in-line retry ladder. */
  llmExhausted?: boolean
  /** Server-observed upstream error string (forwarded from chatProcessor). */
  upstreamError?: string
  /**
   * Updated anon Tier-1 cred state, when any action in this turn mutated it.
   * `undefined` = no change (client keeps current). `null` = wipe (e.g. after
   * a failed flow). The /api/chat route ships this back to the browser, which
   * writes it to sessionStorage. Tab close = state gone.
   */
  anonStoreCreds?: AnonStoreCreds | null
}

// --- History + session helpers ---

interface StoredChat {
  messages: ChatMessage[]
  session?: SessionState
}

async function loadChat(collection: string, uid: string): Promise<StoredChat> {
  // Anon visitors don't have server-side history — Dexie holds it client-side.
  if (isAnonUid(uid)) return { messages: [], session: {} }
  const doc = await getAdminFirestore().collection(collection).doc(uid).get()
  if (!doc.exists) return { messages: [], session: {} }
  const data = doc.data()!
  return {
    messages: (data.messages as ChatMessage[]) || [],
    session: (data.session as SessionState) || {},
  }
}

async function saveChat(collection: string, uid: string, messages: ChatMessage[], session: SessionState): Promise<void> {
  if (isAnonUid(uid)) return // anon session — no Firestore writes
  const trimmed = messages.slice(-MAX_HISTORY)
  await getAdminFirestore().collection(collection).doc(uid).set({
    messages: trimmed,
    session,
    updatedAt: new Date().toISOString(),
  })
}

// --- Context builder ---

async function buildContext(uid: string, displayName?: string, includeTasks = false, session?: SessionState): Promise<UserContext> {
  // Anon visitors: minimal context — list stores by name (so the LLM can
  // talk about "we support Shufersal, מקור השפע, etc.") but everything
  // shows as not-connected, no standing list, no schedule. Tools that need
  // server-side state will return their own auth-required errors when called.
  // Lookup tables for chain website URL + specialty description by plugin id.
  // Shufersal isn't in REXAIL_STORES (it has its own plugin) — its description
  // is hardcoded since it's well-known.
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
      }
    })
  )

  return {
    displayName,
    // Logged-in users land in Tier 2 by default; explicit consent on file
    // promotes them to Tier 3. The bot leads with this in every privacy answer.
    currentTier: consent?.acceptedAt ? 'tier-3' : 'tier-2',
    stores: storeContexts,
    defaultStore: userStores.defaultStore,
    session,
    tasks: tasks || undefined,
    hasCredentials: hasCreds,
    // null = explicit "no consent on file", undefined = couldn't read. The
    // chatProcessor reads both as "not granted" for prompt purposes; we use
    // null for clarity in the wire log.
    serverCredsConsent: consent,
  }
}

// --- Main brain ---

/** Safety cap on the agentic loop — prevents infinite tool loops. */
const MAX_AGENTIC_STEPS = 5

export async function handleReset(collection: string, uid: string): Promise<void> {
  await saveChat(collection, uid, [], {})
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

export async function processChatMessage(input: ChatBrainInput): Promise<ChatBrainResult> {
  initStores()

  const { uid, text, displayName, historyCollection, includeTasks, onStatus, seedHistory, anonStoreCreds } = input

  const loaded = await loadChat(historyCollection, uid)
  // For anon visitors loadChat returns empty (no Firestore). Honor the
  // client-supplied seedHistory (Dexie source-of-truth) so context survives
  // across turns. Cap to last 20 messages to bound LLM token usage.
  const persistedHistory = (isAnonUid(uid) && seedHistory?.length)
    ? seedHistory.slice(-20)
    : loaded.messages
  const session: SessionState = loaded.session || {}

  const context = await buildContext(uid, displayName, includeTasks, session)

  // Working conversation for this turn. Starts with persisted text history,
  // adds the new user message, and — during the agentic loop — accumulates
  // assistant tool-call and tool-result messages that the LLM will see on
  // subsequent iterations. Only user/assistant text is persisted back to Firestore.
  const working: LLMMessage[] = [...persistedHistory, { role: 'user', content: text }]

  let replyText = ''
  let thinking: string | undefined
  let allActions: ChatBrainResult['actions'] = []
  let pendingSelections: PendingProductSelection[] | undefined
  let llmExhausted = false
  let upstreamError: string | undefined
  // Anon cred state carried across the agentic loop's tool calls. Starts
  // from whatever the client shipped (sessionStorage), updates as tools
  // mutate it, and the latest value is returned to the client at the end.
  let workingAnonCreds: AnonStoreCreds | null | undefined = anonStoreCreds
  let anonCredsTouched = false

  for (let step = 0; step < MAX_AGENTIC_STEPS; step++) {
    const result = await processChat(working, context, onStatus)
    thinking = thinking ?? result.thinking
    if (result.llmExhausted) {
      llmExhausted = true
      upstreamError = result.upstreamError
    }

    // set_session is a sentinel hint, not a real tool call — update session and exclude it from tool execution.
    for (const action of result.actions) {
      if (action.action === 'set_session' && action.activeStore !== undefined) {
        session.activeStore = action.activeStore as string | null
      } else if (typeof action.store === 'string') {
        session.activeStore = action.store
      }
    }
    const executableActions = result.actions.filter(a => a.action !== 'set_session')
    allActions = [...allActions, ...executableActions]

    console.log(`[ChatBrain] step=${step} uid=${uid} text=${(result.reply || '').slice(0, 40)} calls=${executableActions.map(a => a.action).join(',') || 'none'} session=${JSON.stringify(session)}`)

    // LLM returned only text (or set_session hints) — that's the final reply.
    if (executableActions.length === 0) {
      replyText = result.reply
      break
    }

    // Record the assistant's tool-call turn on the working history so the next LLM call sees it.
    // `__sig` is the Gemini thoughtSignature — strip from args (it's not a real
    // arg) and hoist it to the toolCall envelope so the next round-trip carries
    // it back to Gemini (required by flash-latest / 3.x; see geminiClient.ts).
    working.push({
      role: 'assistant',
      content: result.reply || undefined,
      toolCalls: executableActions.map(a => ({
        name: a.action,
        args: Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'action' && k !== '__sig')),
        ...(typeof a.__sig === 'string' ? { thoughtSignature: a.__sig } : {}),
      })),
    })

    // Execute tools.
    let actionResult
    try {
      actionResult = await executeActions(uid, executableActions, session.activeStore, workingAnonCreds)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ChatBrain] Action execution threw:', msg)
      actionResult = { results: executableActions.map(a => ({ name: a.action, result: `error: ${msg}` })), pendingSelections: undefined, anonStoreCreds: undefined }
    }

    // Thread anon-cred updates forward across agentic-loop iterations.
    if (actionResult.anonStoreCreds !== undefined) {
      workingAnonCreds = actionResult.anonStoreCreds
      anonCredsTouched = true
    }

    // Record the tool responses so the next LLM iteration can reason over them.
    working.push({
      role: 'tool',
      toolResults: actionResult.results,
    })

    // Product picker requires a user button press — stop the agentic loop here.
    // The reply is whatever the LLM already said plus the search prompt text.
    if (actionResult.pendingSelections?.length) {
      pendingSelections = actionResult.pendingSelections
      const extraText = actionResult.results.map(r => r.result).filter(Boolean).join('\n\n')
      replyText = [result.reply, extraText].filter(Boolean).join('\n\n') || '...'
      break
    }
  }

  if (!replyText) {
    // Hit the safety cap with no text response — surface a generic acknowledgment.
    replyText = allActions.length > 0 ? '✓' : 'לא הבנתי, נסה שוב.'
  }

  // Persist only user + final-assistant text (tool calls/results are transient).
  // When the LLM exhausted, we DON'T persist either — the user message is
  // still pending a real reply. The webhook will enqueue (Telegram) or the
  // web client will poll for retry. Persisting now would mean: (a) the user
  // message gets a fake assistant ack baked into history; (b) the cron retry
  // sees the duplicate user line and produces a confusing trace.
  if (!llmExhausted) {
    persistedHistory.push({ role: 'user', content: text })
    persistedHistory.push({ role: 'assistant', content: replyText })
    await saveChat(historyCollection, uid, persistedHistory, session)
  }

  // Persist pending searches
  let selectionsWithKeys: ChatBrainResult['pendingSelections']
  if (pendingSelections?.length) {
    selectionsWithKeys = await Promise.all(
      pendingSelections.map(async (sel) => {
        const searchKey = await savePendingSearch(uid, sel)
        return { ...sel, searchKey }
      })
    )
  }

  return {
    reply: replyText,
    thinking,
    actions: allActions,
    pendingSelections: selectionsWithKeys,
    llmExhausted,
    upstreamError,
    // Only surface the field when something in this turn changed it. The
    // /api/chat route forwards undefined as omitted-from-response and null
    // as explicit "wipe."
    anonStoreCreds: anonCredsTouched ? workingAnonCreds ?? null : undefined,
  }
}
