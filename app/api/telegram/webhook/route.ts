// CALLER-KEYED ROUTE
/**
 * POST /api/telegram/webhook — Telegram Bot update handler.
 *
 * Auth: validates X-Telegram-Bot-Api-Secret-Token header.
 * Resolves telegramUserId → Aglamazo uid via Firestore telegramLinks collection.
 * Routes messages to intent handler (layer 2) or handles /link command.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { sendMessage, sendWithKeyboard, answerCallbackQuery } from '@/app/services/telegram/telegramClient'
import { processChat, type ChatMessage, type UserContext } from '@/app/services/telegram/chatProcessor'
import { executeActions, savePendingSearch, loadPendingSearch, deletePendingSearch, type PendingProductSelection } from '@/app/services/telegram/actionExecutor'
import { getGroceryData } from '@/app/services/grocery/groceryStore'
import { addPendingItems, addToStanding } from '@/app/services/grocery/groceryStore'
import { saveProductMapping } from '@/app/services/grocery/productResolver'
import type { TelegramCallbackQuery } from '@/app/services/telegram/types'
import { isCredentialsVerified, saveCredentials, setCredentialsVerified, login as shufersalLogin } from '@/app/services/grocery/shufersalClient'
import type { TelegramUpdate, TelegramMessage } from '@/app/services/telegram/types'

const MAX_HISTORY = 10

/** Load recent chat messages from Firestore. */
async function loadHistory(uid: string): Promise<ChatMessage[]> {
  const doc = await getAdminFirestore().collection('telegramChatHistory').doc(uid).get()
  if (!doc.exists) return []
  return (doc.data()?.messages as ChatMessage[]) || []
}

/** Save chat messages to Firestore. */
async function saveHistory(uid: string, messages: ChatMessage[]): Promise<void> {
  // Keep only the last MAX_HISTORY messages
  const trimmed = messages.slice(-MAX_HISTORY)
  await getAdminFirestore().collection('telegramChatHistory').doc(uid).set({
    messages: trimmed,
    updatedAt: new Date().toISOString(),
  })
}

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

export const maxDuration = 30

export async function POST(request: NextRequest) {
  // Validate Telegram secret token
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Handle callback queries (inline keyboard presses)
  if (update.callback_query) {
    const testMode = request.headers.get('x-telegram-test') === 'true'
    try {
      const cbResult = await handleCallbackQuery(update.callback_query, testMode)
      if (testMode) return NextResponse.json({ ok: true, ...cbResult })
    } catch (err) {
      console.error('[Telegram] Callback error:', err)
    }
    return NextResponse.json({ ok: true })
  }

  const message = update.message
  if (!message?.text || !message.from) {
    return NextResponse.json({ ok: true })
  }

  // In groups, only respond to bot commands or mentions
  if (message.chat.type !== 'private') {
    const isBotCommand = message.entities?.some(e => e.type === 'bot_command')
    const mentionsBot = message.entities?.some(e => e.type === 'mention')
    if (!isBotCommand && !mentionsBot) {
      return NextResponse.json({ ok: true })
    }
  }

  try {
    // Handle /link command — registration flow
    if (message.text.match(/^\/link(@\w+)?(\s|$)/)) {
      await handleLinkCommand(message)
      return NextResponse.json({ ok: true })
    }

    // Handle /unlink command
    if (message.text.match(/^\/unlink(@\w+)?$/)) {
      await handleUnlinkCommand(message)
      return NextResponse.json({ ok: true })
    }

    // Handle /reset command — clear chat history
    if (message.text.match(/^\/reset(@\w+)?$/)) {
      const testMode = request.headers.get('x-telegram-test') === 'true'
      const resetUid = testMode ? 'test-user' : (await resolveLink(message.from.id, message.chat.id))?.uid
      if (resetUid) await saveHistory(resetUid, [])
      const reply = 'היסטוריה נמחקה!'
      if (testMode) return NextResponse.json({ ok: true, response: reply, actions: [] })
      await sendMessage(message.chat.id, reply)
      return NextResponse.json({ ok: true })
    }

    // Handle /clear command — clear standing list and pending changes
    if (message.text.match(/^\/clear(@\w+)?$/)) {
      const testMode = request.headers.get('x-telegram-test') === 'true'
      const clearUid = testMode ? 'test-user' : (await resolveLink(message.from.id, message.chat.id))?.uid
      if (clearUid) {
        const firestore = getAdminFirestore()
        const doc = await firestore.collection('groceries').doc(clearUid).get()
        if (doc.exists) {
          await firestore.collection('groceries').doc(clearUid).update({
            standingList: [],
            pendingChanges: { add: [], remove: [] },
            updatedAt: new Date().toISOString(),
          })
        }
      }
      const reply = 'רשימה קבועה ושינויים שבועיים נמחקו.'
      if (testMode) return NextResponse.json({ ok: true, response: reply, actions: [] })
      await sendMessage(message.chat.id, reply)
      return NextResponse.json({ ok: true })
    }

    // Handle /start command (Telegram's default on first interaction)
    if (message.text === '/start') {
      await sendMessage(message.chat.id,
        'שלום! אני העוזר האישי של Aglamazo.\n\n' +
        'כדי לחבר את החשבון שלך, שלח:\n' +
        '/link <קוד>\n\n' +
        'את הקוד תמצא בהגדרות של Aglamazo.'
      )
      return NextResponse.json({ ok: true })
    }

    // Resolve telegram user → Aglamazo uid
    const testMode = request.headers.get('x-telegram-test') === 'true'
    const link = testMode
      ? { uid: 'test-user' }
      : await resolveLink(message.from.id, message.chat.id)
    if (!link) {
      await sendMessage(message.chat.id,
        'החשבון לא מחובר. שלח /link <קוד> כדי לחבר.'
      )
      return NextResponse.json({ ok: true })
    }

    // Load conversation history from Firestore
    const chatId = message.chat.id
    const history = await loadHistory(link.uid)
    history.push({ role: 'user', content: message.text })

    // Load grocery data and credentials status for context
    const [groceryData, hasCreds] = await Promise.all([
      getGroceryData(link.uid).catch(() => null),
      isCredentialsVerified(link.uid).catch(() => false),
    ])
    const context: UserContext = {
      displayName: message.from.first_name,
      hasCredentials: hasCreds,
    }
    if (groceryData) {
      context.standingList = groceryData.standingList.map(i => ({ name: i.name, qty: i.qty }))
      context.pendingChanges = {
        add: groceryData.pendingChanges.add.map(i => ({ name: i.name, qty: i.qty })),
        remove: groceryData.pendingChanges.remove,
      }
      context.orderStatus = groceryData.orderCycle?.status
      context.schedule = groceryData.schedule
    }

    // Process via LLM
    const result = await processChat(history, context)
    console.log(`[Telegram] uid=${link.uid} actions=${result.actions.map(a => a.action).join(',') || 'none'}: ${message.text}`)

    // Execute actions against Firestore
    let replyText = result.reply
    let pendingSelections: typeof actionResult.pendingSelections | undefined
    let actionResult: Awaited<ReturnType<typeof executeActions>> = { followUp: null }

    if (result.actions.length > 0) {
      // In prod: send the LLM reply immediately, then execute actions and follow up
      if (!testMode) {
        await sendMessage(chatId, result.reply)
      }

      actionResult = await executeActions(link.uid, result.actions)
      if (actionResult.followUp) {
        replyText = `${replyText}\n\n${actionResult.followUp}`
      }
      pendingSelections = actionResult.pendingSelections
    }

    // Store bot reply in history
    history.push({ role: 'assistant', content: replyText })
    await saveHistory(link.uid, history)

    // Save pending searches (both test and prod need this for callbacks)
    const searchKeys: string[] = []
    if (pendingSelections?.length) {
      for (const sel of pendingSelections) {
        const key = await savePendingSearch(link.uid, sel)
        searchKeys.push(key)
      }
    }

    // In test mode, return response directly
    if (testMode) {
      return NextResponse.json({
        ok: true,
        response: replyText,
        actions: result.actions,
        pendingSelections: pendingSelections?.map((sel, i) => ({ ...sel, searchKey: searchKeys[i] })),
      })
    }

    // Send follow-up from action (or the reply itself if no actions)
    if (result.actions.length > 0) {
      if (actionResult.followUp) {
        await sendMessage(chatId, actionResult.followUp)
      }
    } else {
      await sendMessage(chatId, replyText)
    }

    // Send product selection keyboards
    if (pendingSelections?.length) {
      for (let si = 0; si < pendingSelections.length; si++) {
        const sel = pendingSelections[si]
        const searchKey = searchKeys[si]
        const buttons = sel.results.map((r, idx) => [{
          text: `${r.name}${r.brand ? ` | ${r.brand}` : ''} — ${r.price}₪${r.unitPrice ? ` (${r.unitPrice})` : ''}`,
          callback_data: `p:${searchKey}:${idx}`,
        }])
        const targetLabel = sel.target === 'standing' ? 'רשימה קבועה' : 'הזמנה'
        await sendWithKeyboard(
          chatId,
          `בחר "${sel.query}" (${targetLabel}):`,
          { inline_keyboard: buttons },
        )
      }
    }

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram Webhook] Error:', errMsg)
    // Don't send error details to user in production
  }

  return NextResponse.json({ ok: true })
}

/**
 * /link <code> — link Telegram user/group to Aglamazo account.
 * The code is generated in the Aglamazo UI (layer 6).
 */
async function handleLinkCommand(message: TelegramMessage) {
  // In groups Telegram sends "/link@BotName CODE" — strip the @mention from the command
  const parts = message.text!.replace(/^\/link(@\w+)?/, '/link').split(' ')
  if (parts.length < 2) {
    await sendMessage(message.chat.id,
      'שימוש: /link <קוד>\nאת הקוד תמצא בהגדרות של Aglamazo.'
    )
    return
  }

  const code = parts[1].trim()
  const firestore = getAdminFirestore()

  // Look up the link code
  const codeDoc = await firestore.collection('telegramLinkCodes').doc(code).get()
  if (!codeDoc.exists) {
    await sendMessage(message.chat.id, 'קוד לא תקין או שפג תוקפו.')
    return
  }

  const codeData = codeDoc.data()!
  const expiresAt = new Date(codeData.expiresAt)
  if (expiresAt < new Date()) {
    await firestore.collection('telegramLinkCodes').doc(code).delete()
    await sendMessage(message.chat.id, 'הקוד פג תוקף. צור קוד חדש בהגדרות.')
    return
  }

  const uid = codeData.uid as string
  const telegramUserId = message.from!.id
  const chatId = message.chat.id
  const chatType = message.chat.type

  // Create the link
  const linkData = {
    telegramUserId,
    telegramChatId: chatId,
    chatType,
    uid,
    linkedAt: new Date().toISOString(),
    displayName: message.from!.first_name || '',
  }

  // Use composite key: {telegramUserId}_{chatId}
  const linkId = `${telegramUserId}_${chatId}`
  await firestore.collection('telegramLinks').doc(linkId).set(linkData)

  // Delete the used code
  await firestore.collection('telegramLinkCodes').doc(code).delete()

  const chatLabel = chatType === 'private' ? 'צ\'אט פרטי' : `קבוצה "${message.chat.title}"`
  await sendMessage(chatId, `חשבון חובר בהצלחה (${chatLabel}). אפשר להתחיל!`)

  console.log(`[Telegram] Linked telegram=${telegramUserId} chat=${chatId} → uid=${uid}`)
}

/**
 * /unlink — remove the link between this Telegram chat and Aglamazo.
 */
async function handleUnlinkCommand(message: TelegramMessage) {
  if (!message.from) return

  const firestore = getAdminFirestore()
  const linkId = `${message.from.id}_${message.chat.id}`
  const linkDoc = await firestore.collection('telegramLinks').doc(linkId).get()

  if (!linkDoc.exists) {
    await sendMessage(message.chat.id, 'החשבון לא מחובר.')
    return
  }

  await firestore.collection('telegramLinks').doc(linkId).delete()
  await sendMessage(message.chat.id, 'החשבון נותק.')

  console.log(`[Telegram] Unlinked telegram=${message.from.id} chat=${message.chat.id}`)
}

/**
 * Resolve a Telegram user+chat → Aglamazo uid.
 * Checks both direct user link and chat-level link.
 */
async function resolveLink(telegramUserId: number, chatId: number) {
  const firestore = getAdminFirestore()

  // Try exact match first (user + chat)
  const linkId = `${telegramUserId}_${chatId}`
  const doc = await firestore.collection('telegramLinks').doc(linkId).get()
  if (doc.exists) return doc.data() as { uid: string }

  // For groups: check if any user linked this chat
  const groupQuery = await firestore
    .collection('telegramLinks')
    .where('telegramChatId', '==', chatId)
    .limit(1)
    .get()

  if (!groupQuery.empty) {
    return groupQuery.docs[0].data() as { uid: string }
  }

  // Fallback: find any link for this Telegram user (e.g. private chat link)
  const userQuery = await firestore
    .collection('telegramLinks')
    .where('telegramUserId', '==', telegramUserId)
    .limit(1)
    .get()

  if (!userQuery.empty) {
    return userQuery.docs[0].data() as { uid: string }
  }

  return null
}

/**
 * Handle inline keyboard button press (product selection).
 * callback_data format: "p:<searchKey>:<resultIndex>"
 */
async function handleCallbackQuery(query: TelegramCallbackQuery, testMode = false) {
  const data = query.data || ''
  if (!data.startsWith('p:')) {
    if (!testMode) await answerCallbackQuery(query.id)
    return { callbackAnswer: 'unknown' }
  }

  const parts = data.split(':')
  if (parts.length !== 3) {
    if (!testMode) await answerCallbackQuery(query.id, 'שגיאה')
    return { callbackAnswer: 'שגיאה' }
  }

  const searchKey = parts[1]
  const resultIndex = parseInt(parts[2], 10)
  const chatId = query.message?.chat.id
  if (!chatId) return { callbackAnswer: 'שגיאה' }

  const uid = testMode ? 'test-user' : (await resolveLink(query.from.id, chatId))?.uid
  if (!uid) {
    if (!testMode) await answerCallbackQuery(query.id, 'חשבון לא מחובר')
    return { callbackAnswer: 'חשבון לא מחובר' }
  }

  // Load stored search context
  const pendingSearch = await loadPendingSearch(uid, searchKey)
  if (!pendingSearch || resultIndex >= pendingSearch.results.length) {
    if (!testMode) await answerCallbackQuery(query.id, 'החיפוש פג תוקף')
    return { callbackAnswer: 'החיפוש פג תוקף' }
  }

  const selected = pendingSearch.results[resultIndex]
  const item = { name: selected.name, qty: pendingSearch.qty, catalogId: selected.catalogId }

  // Save to correct target
  if (pendingSearch.target === 'standing') {
    await addToStanding(uid, [item])
  } else {
    await addPendingItems(uid, [item])
  }

  // Save mapping for future use
  await saveProductMapping(uid, pendingSearch.query, selected.catalogId, selected.name)

  // Cleanup
  await deletePendingSearch(uid, searchKey)

  const targetLabel = pendingSearch.target === 'standing' ? 'קבועה' : 'הזמנה'
  const confirmMsg = `✅ ${selected.name} (x${pendingSearch.qty}) נוסף לרשימה ${targetLabel}`
  if (!testMode) {
    await answerCallbackQuery(query.id, `נוסף ל${targetLabel}`)
    await sendMessage(chatId, confirmMsg)
  }
  console.log(`[Telegram] Product picked: "${pendingSearch.query}" → ${selected.catalogId} (${pendingSearch.target})`)
  return { callbackAnswer: confirmMsg }
}
