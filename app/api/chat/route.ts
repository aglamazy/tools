import { NextRequest, NextResponse } from 'next/server'
import { requireTc } from '@/app/lib/apiGuard'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { processChat, type ChatMessage, type UserContext } from '@/app/services/telegram/chatProcessor'
import { executeActions, savePendingSearch } from '@/app/services/telegram/actionExecutor'
import { getGroceryData } from '@/app/services/grocery/groceryStore'
import { getUserStores, getStoreData } from '@/app/services/grocery/groceryStoreMulti'
import { getAllStores } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'
import { isCredentialsVerified } from '@/app/services/grocery/shufersalClient'
import { listTasks } from '@/app/services/taskFirestoreService'

const MAX_HISTORY = 10
const COLLECTION = 'appChatHistory'

async function loadHistory(uid: string): Promise<ChatMessage[]> {
  const doc = await getAdminFirestore().collection(COLLECTION).doc(uid).get()
  if (!doc.exists) return []
  return (doc.data()?.messages as ChatMessage[]) || []
}

async function saveHistory(uid: string, messages: ChatMessage[]): Promise<void> {
  const trimmed = messages.slice(-MAX_HISTORY)
  await getAdminFirestore().collection(COLLECTION).doc(uid).set({
    messages: trimmed,
    updatedAt: new Date().toISOString(),
  })
}

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error

  const uid = guard.uid
  initStores()

  let body: { message: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const text = body.message?.trim()
  if (!text) {
    return NextResponse.json({ success: false, error: 'Empty message' }, { status: 400 })
  }

  // Handle special commands
  if (text === '/reset') {
    await saveHistory(uid, [])
    return NextResponse.json({ success: true, reply: 'היסטוריה נמחקה!', actions: [] })
  }

  if (text === '/clear') {
    const firestore = getAdminFirestore()
    const doc = await firestore.collection('groceries').doc(uid).get()
    if (doc.exists) {
      await firestore.collection('groceries').doc(uid).update({
        standingList: {},
        pendingChanges: { add: {}, remove: [] },
        updatedAt: new Date().toISOString(),
      })
    }
    return NextResponse.json({ success: true, reply: 'רשימה קבועה ושינויים שבועיים נמחקו.', actions: [] })
  }

  try {
    const history = await loadHistory(uid)
    history.push({ role: 'user', content: text })

    // Build context (same logic as Telegram webhook)
    const [groceryData, hasCreds, userStores, tasks] = await Promise.all([
      getGroceryData(uid).catch(() => null),
      isCredentialsVerified(uid).catch(() => false),
      getUserStores(uid).catch(() => ({ activeStores: [] as string[], defaultStore: 'shufersal' })),
      listTasks(uid).catch(() => []),
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

    const context: UserContext = {
      displayName: guard.claims.email?.split('@')[0],
      stores: storeContexts,
      defaultStore: userStores.defaultStore,
      tasks,
      hasCredentials: hasCreds,
      standingList: groceryData?.standingList ? Object.values(groceryData.standingList).map(i => ({ name: i.name, qty: i.qty, unit: i.unit })) : undefined,
      pendingChanges: groceryData ? {
        add: Object.values(groceryData.pendingChanges.add).map(i => ({ name: i.name, qty: i.qty, unit: i.unit })),
        remove: groceryData.pendingChanges.remove,
      } : undefined,
      orderStatus: groceryData?.orderCycle?.status,
      schedule: groceryData?.schedule,
    }

    // Actions that gather info and should auto-continue to a second LLM round
    const AUTO_CONTINUE_ACTIONS = new Set(['list_slots', 'show_list', 'show_orders', 'list_tasks'])
    const MAX_ROUNDS = 2

    let replyText = ''
    let thinking: string | undefined
    let pendingSelections: Awaited<ReturnType<typeof executeActions>>['pendingSelections']
    let finalActions: typeof pendingSelections = undefined

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await processChat(history, context)
      console.log(`[AppChat] round=${round} uid=${uid} actions=${result.actions.map(a => a.action).join(',') || 'none'}: ${text}`)
      thinking = thinking ?? result.thinking

      replyText = result.reply
      let followUp = ''

      if (result.actions.length > 0) {
        try {
          const actionResult = await executeActions(uid, result.actions)
          followUp = actionResult.followUp || ''
          pendingSelections = actionResult.pendingSelections
        } catch (actionErr) {
          console.error('[AppChat] Action execution failed:', actionErr)
          followUp = 'שגיאה בביצוע הפעולה. נסה שוב.'
        }
      }

      const roundText = [replyText, followUp].filter(Boolean).join('\n\n')

      // Auto-continue if this round only did info-gathering (no pending user selection)
      const didOnlyInfo = result.actions.length > 0
        && result.actions.every(a => AUTO_CONTINUE_ACTIONS.has(a.action))
        && !pendingSelections?.length
        && round < MAX_ROUNDS - 1

      if (didOnlyInfo) {
        history.push({ role: 'assistant', content: roundText })
        replyText = '' // second round will set the final reply
        continue
      }

      replyText = roundText
      break
    }

    // Save full reply including action output so the bot sees tool results next turn
    history.push({ role: 'assistant', content: replyText })
    await saveHistory(uid, history)

    // Save pending searches and attach keys
    const selectionsWithKeys = pendingSelections?.length
      ? await Promise.all(pendingSelections.map(async (sel) => {
        const searchKey = await savePendingSearch(uid, sel)
        return { ...sel, searchKey }
      }))
      : undefined

    return NextResponse.json({
      success: true,
      reply: replyText,
      thinking,
      pendingSelections: selectionsWithKeys,
    })
  } catch (err) {
    console.error('[AppChat] Error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
