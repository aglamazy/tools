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
import { getGroceryData } from '@/app/services/grocery/groceryStore'
import { getUserStores, getStoreData } from '@/app/services/grocery/groceryStoreMulti'
import { getAllStores } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'
import { isCredentialsVerified } from '@/app/services/grocery/shufersalClient'
import { listTasks } from '@/app/services/taskFirestoreService'

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
  const [groceryData, hasCreds, userStores, tasks] = await Promise.all([
    getGroceryData(uid).catch(() => null),
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
          add: Object.values(storeData.pendingChanges.add).map(i => ({ name: i.name, qty: i.qty, unit: i.unit })),
          remove: storeData.pendingChanges.remove,
        } : undefined,
        orderStatus: storeData?.orderCycle?.status,
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
    // Legacy fallback
    hasCredentials: hasCreds,
    standingList: groceryData?.standingList ? Object.values(groceryData.standingList).map(i => ({ name: i.name, qty: i.qty, unit: i.unit })) : undefined,
    pendingChanges: groceryData ? {
      add: Object.values(groceryData.pendingChanges.add).map(i => ({ name: i.name, qty: i.qty, unit: i.unit })),
      remove: groceryData.pendingChanges.remove,
    } : undefined,
    orderStatus: groceryData?.orderCycle?.status,
    schedule: groceryData?.schedule,
  }
}

// --- Main brain ---

const AUTO_CONTINUE_ACTIONS = new Set(['list_slots', 'show_orders', 'list_tasks'])
const MAX_ROUNDS = 2

export async function handleReset(collection: string, uid: string): Promise<void> {
  await saveChat(collection, uid, [], {})
}

export async function handleClear(uid: string): Promise<void> {
  const firestore = getAdminFirestore()
  const doc = await firestore.collection('groceries').doc(uid).get()
  if (doc.exists) {
    await firestore.collection('groceries').doc(uid).update({
      standingList: {},
      pendingChanges: { add: {}, remove: [] },
      updatedAt: new Date().toISOString(),
    })
  }
}

export async function processChatMessage(input: ChatBrainInput): Promise<ChatBrainResult> {
  initStores()

  const { uid, text, displayName, historyCollection, includeTasks } = input

  const loaded = await loadChat(historyCollection, uid)
  const history = loaded.messages
  const session: SessionState = loaded.session || {}
  history.push({ role: 'user', content: text })

  const context = await buildContext(uid, displayName, includeTasks, session)

  let replyText = ''
  let thinking: string | undefined
  let allActions: ChatBrainResult['actions'] = []
  let pendingSelections: PendingProductSelection[] | undefined

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await processChat(history, context)
    console.log(`[ChatBrain] round=${round} uid=${uid} actions=${result.actions.map(a => a.action).join(',') || 'none'}: ${text}`)
    thinking = thinking ?? result.thinking
    allActions = result.actions

    // Handle set_session from LLM
    for (const action of result.actions) {
      if (action.action === 'set_session') {
        if (action.activeStore !== undefined) session.activeStore = action.activeStore as string | null
      }
    }

    // Auto-track activeStore: if any action specifies a store, remember it
    for (const action of result.actions) {
      if (action.action !== 'set_session' && typeof action.store === 'string') {
        session.activeStore = action.store
      }
    }
    console.log(`[ChatBrain] session:`, JSON.stringify(session))

    // Filter out set_session before executing
    const executableActions = result.actions.filter(a => a.action !== 'set_session')

    replyText = result.reply
    let followUp = ''

    if (executableActions.length > 0) {
      try {
        const actionResult = await executeActions(uid, executableActions)
        followUp = actionResult.followUp || ''
        pendingSelections = actionResult.pendingSelections
      } catch (actionErr) {
        const msg = actionErr instanceof Error ? actionErr.message : String(actionErr)
        console.error('[ChatBrain] Action execution failed:', msg)
        followUp = 'שגיאה בביצוע הפעולה. נסה שוב.'
      }
    }

    const roundText = [replyText, followUp].filter(Boolean).join('\n\n')

    const didOnlyInfo = executableActions.length > 0
      && executableActions.every(a => AUTO_CONTINUE_ACTIONS.has(a.action))
      && !pendingSelections?.length
      && round < MAX_ROUNDS - 1

    if (didOnlyInfo) {
      history.push({ role: 'assistant', content: roundText })
      replyText = ''
      continue
    }

    replyText = roundText
    break
  }

  // Save history + session
  history.push({ role: 'assistant', content: replyText })
  await saveChat(historyCollection, uid, history, session)

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
