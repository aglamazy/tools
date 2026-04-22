/**
 * Shared chat brain — single processing pipeline used by all channels
 * (Telegram webhook, in-app chat widget, test CLI).
 *
 * Handles: history management, session state, context building, LLM call,
 * action execution, auto-continue for info-gathering actions, pending search persistence.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { processChat, type ChatMessage, type UserContext } from '@/app/services/telegram/chatProcessor'
import { executeActions, savePendingSearch, type PendingProductSelection } from '@/app/services/telegram/actionExecutor'
import { getUserStores, getStoreData } from '@/app/services/grocery/groceryStoreMulti'
import { getAllStores } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'
import { isCredentialsVerified } from '@/app/services/grocery/shufersalClient'
import { listTasks } from '@/app/services/taskFirestoreService'
import type { LLMMessage } from '@/app/services/llm/types'

const MAX_HISTORY = 10

export interface SessionState {
  activeStore?: string | null
}

export interface ChatBrainInput {
  uid: string
  text: string
  displayName?: string
  historyCollection: string
  includeTasks?: boolean
}

export interface ChatBrainResult {
  reply: string
  thinking?: string
  actions: { action: string; [key: string]: unknown }[]
  pendingSelections?: (PendingProductSelection & { searchKey: string })[]
}

// --- History + session helpers ---

interface StoredChat {
  messages: ChatMessage[]
  session?: SessionState
}

async function loadChat(collection: string, uid: string): Promise<StoredChat> {
  const doc = await getAdminFirestore().collection(collection).doc(uid).get()
  if (!doc.exists) return { messages: [], session: {} }
  const data = doc.data()!
  return {
    messages: (data.messages as ChatMessage[]) || [],
    session: (data.session as SessionState) || {},
  }
}

async function saveChat(collection: string, uid: string, messages: ChatMessage[], session: SessionState): Promise<void> {
  const trimmed = messages.slice(-MAX_HISTORY)
  await getAdminFirestore().collection(collection).doc(uid).set({
    messages: trimmed,
    session,
    updatedAt: new Date().toISOString(),
  })
}

// --- Context builder ---

async function buildContext(uid: string, displayName?: string, includeTasks = false, session?: SessionState): Promise<UserContext> {
  const [hasCreds, userStores, tasks] = await Promise.all([
    isCredentialsVerified(uid).catch(() => false),
    getUserStores(uid).catch(() => ({ activeStores: [] as string[], defaultStore: 'shufersal' })),
    includeTasks ? listTasks(uid).catch(() => []) : Promise.resolve(undefined),
  ])

  const storeContexts = await Promise.all(
    getAllStores().map(async (store) => {
      const connected = await store.isAuthenticated(uid).catch(() => false)
      const storeData = await getStoreData(uid, store.id).catch(() => null)
      return {
        id: store.id,
        label: store.label,
        connected,
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
    stores: storeContexts,
    defaultStore: userStores.defaultStore,
    session,
    tasks: tasks || undefined,
    hasCredentials: hasCreds,
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

  const { uid, text, displayName, historyCollection, includeTasks } = input

  const loaded = await loadChat(historyCollection, uid)
  const persistedHistory = loaded.messages
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

  for (let step = 0; step < MAX_AGENTIC_STEPS; step++) {
    const result = await processChat(working, context)
    thinking = thinking ?? result.thinking

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
    working.push({
      role: 'assistant',
      content: result.reply || undefined,
      toolCalls: executableActions.map(a => ({
        name: a.action,
        args: Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'action')),
      })),
    })

    // Execute tools.
    let actionResult
    try {
      actionResult = await executeActions(uid, executableActions, session.activeStore)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ChatBrain] Action execution threw:', msg)
      actionResult = { results: executableActions.map(a => ({ name: a.action, result: `error: ${msg}` })), pendingSelections: undefined }
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
  persistedHistory.push({ role: 'user', content: text })
  persistedHistory.push({ role: 'assistant', content: replyText })
  await saveChat(historyCollection, uid, persistedHistory, session)

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
  }
}
