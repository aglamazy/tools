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
  switch (name) {
    case 'search_product':
    case 're_search':
      return args.query ? `חיפשתי "${args.query}".` : ''
    case 'remove_items':
      return itemList('items') ? `הסרתי: ${itemList('items')}.` : 'הסרתי פריטים.'
    case 'remove_standing':
      return itemList('items') ? `הסרתי מהקבועה: ${itemList('items')}.` : 'הסרתי מהקבועה.'
    case 'move_to_standing':
      return itemList('items') ? `העברתי לקבועה: ${itemList('items')}.` : 'העברתי לקבועה.'
    case 'clear_pending':
      return 'ניקיתי את המתנה.'
    case 'set_schedule':
      return 'קבעתי לוח זמנים.'
    case 'create_task':
      return 'יצרתי משימה.'
    case 'complete_task':
      return 'סימנתי משימה כהושלמה.'
    case 'delete_task':
      return 'מחקתי משימה.'
    case 'set_default_store':
      return 'עדכנתי חנות ברירת מחדל.'
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

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { buildContextBlock, SYSTEM_PROMPT, type UserContext } from '@/app/services/chat/chatProcessor'
import { savePendingSearch, type PendingProductSelection, type AnonStoreCreds } from '@/app/services/chat/actionExecutor'
import { getUserStores, getStoreData } from '@/app/services/grocery/groceryStoreMulti'
import { getAllStores } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'
import { isCredentialsVerified } from '@/app/services/grocery/shufersalClient'
import { REXAIL_STORES } from '@/app/services/grocery/rexailStores'
import { listTasks } from '@/app/services/taskFirestoreService'
import { getServerCredsConsent } from '@/app/services/consentService'
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
  }
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

  // Shared session — mutated by `set_session` tool, persisted on history.save.
  const session: SessionState = {}

  // Tool context — shared mutable state across all tool calls in the turn.
  const toolCtx: AglamazoToolContext = {
    uid,
    session,
    anonStoreCreds: anonStoreCreds ?? null,
    anonCredsTouched: false,
    pendingSelections: [],
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

  return {
    reply: result.reply,
    thinking: result.thinking,
    actions: result.toolCalls.map((c) => ({ action: c.name, ...c.args })),
    pendingSelections: selectionsWithKeys,
    llmExhausted: false,
    upstreamError: undefined,
    anonStoreCreds: toolCtx.anonCredsTouched ? (toolCtx.anonStoreCreds ?? null) : undefined,
  }
}
