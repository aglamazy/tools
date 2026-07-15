// CALLER-KEYED ROUTE
/**
 * POST /api/telegram/webhook — Telegram Bot update handler.
 *
 * Auth: validates X-Telegram-Bot-Api-Secret-Token header.
 * Resolves telegramUserId → Aglamazo uid via Firestore telegramLinks collection.
 * Routes messages to shared chat brain, handles /link and callback queries.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { sendMessage, sendWithKeyboard, answerCallbackQuery } from '@/app/services/telegram/telegramClient'
import { selectProduct } from '@/app/services/chat/pendingSearchService'
import { processChatMessage, handleReset, handleClear } from '@/app/services/chatBrain'
import { enqueueChatMessage } from '@/app/services/chatQueue'
import { fireNextCheckoutStep } from '@/app/services/grocery/checkoutContinuation'
import { panicAdmin } from '@/app/services/adminPanic'
import { VARIANT_CONFIG } from '@/app/config/variants'
import type { TelegramCallbackQuery, TelegramUpdate, TelegramMessage } from '@/app/services/telegram/types'
import { withServiceCall } from 'agents-observe/next'

const HISTORY_COLLECTION = 'telegramChatHistory'
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

export const maxDuration = 30

async function handler(request: NextRequest) {
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
    try {
      await handleCallbackQuery(update.callback_query)
    } catch (err) {
      console.error('[Telegram] Callback error:', err)
    }
    return NextResponse.json({ ok: true })
  }

  const message = update.message
  if (!message?.text || !message.from) {
    return NextResponse.json({ ok: true })
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

    // Handle /start command
    if (message.text === '/start') {
      await sendMessage(message.chat.id,
        `שלום! אני העוזר האישי של ${VARIANT_CONFIG.name}.\n\n` +
        'כדי לחבר את החשבון שלך, שלח:\n' +
        '/link <קוד>\n\n' +
        `את הקוד תמצא בהגדרות של ${VARIANT_CONFIG.name}.`
      )
      return NextResponse.json({ ok: true })
    }

    // Resolve telegram user → Aglamazo uid
    const link = await resolveLink(message.from.id, message.chat.id)
    if (!link) {
      await sendMessage(message.chat.id,
        'החשבון לא מחובר. שלח /link <קוד> כדי לחבר.'
      )
      return NextResponse.json({ ok: true })
    }

    // Handle /reset command
    if (message.text.match(/^\/reset(@\w+)?$/)) {
      await handleReset(HISTORY_COLLECTION, link.uid)
      await sendMessage(message.chat.id, 'היסטוריה נמחקה!')
      return NextResponse.json({ ok: true })
    }

    // Handle /clear command
    if (message.text.match(/^\/clear(@\w+)?$/)) {
      await handleClear(link.uid)
      await sendMessage(message.chat.id, 'רשימה קבועה ושינויים שבועיים נמחקו.')
      return NextResponse.json({ ok: true })
    }

    // Process via shared brain. The chat brain may surface a status message
    // mid-recovery (e.g. "מערכת מתקשה לענות, מנסה שוב...") — forward it to
    // the same chat. Failures here are non-fatal; we log and keep going.
    const result = await processChatMessage({
      uid: link.uid,
      text: message.text,
      displayName: message.from.first_name,
      historyCollection: HISTORY_COLLECTION,
      includeTasks: true,
      onStatus: async (statusMsg) => {
        try { await sendMessage(message.chat.id, statusMsg) }
        catch (err) { console.warn('[Telegram Webhook] onStatus send failed:', err) }
      },
    })

    await sendMessage(message.chat.id, result.reply)

    // LLM exhausted in-line retries. Enqueue for cron-driven backoff retries
    // AND fire the admin panic so we know upstream is sick. Both are server
    // -only side effects — no client input gates either decision.
    if (result.llmExhausted) {
      try {
        const id = await enqueueChatMessage({
          uid: link.uid,
          telegramChatId: message.chat.id,
          displayName: message.from.first_name,
          text: message.text,
        })
        console.warn(`[Telegram Webhook] Queued chat message id=${id} uid=${link.uid}`)
      } catch (err) {
        console.error('[Telegram Webhook] Enqueue failed:', err)
      }
      panicAdmin({
        source: 'webhook-exhaust',
        upstreamError: result.upstreamError || 'unknown',
        uid: link.uid,
        userTextSnippet: message.text,
      }).catch(err => console.warn('[Telegram Webhook] panicAdmin failed:', err))
    }

    // Send product selection keyboards
    if (result.pendingSelections?.length) {
      for (const sel of result.pendingSelections) {
        const buttons = sel.results.map((r, idx) => [{
          text: `${r.name}${r.brand ? ` | ${r.brand}` : ''} — ${r.price}₪${r.unitPrice ? ` (${r.unitPrice})` : ''}`,
          callback_data: `p:${sel.searchKey}:${idx}`,
        }])
        const targetLabel = sel.target === 'standing' ? 'רשימה קבועה' : 'הזמנה'
        await sendWithKeyboard(
          message.chat.id,
          `בחר "${sel.query}" (${targetLabel}):`,
          { inline_keyboard: buttons },
        )
      }
    }

    // Small-step checkout (#275): Telegram has no client to loop
    // add-batch/finalize the way AppChat.tsx does, so we self-chain —
    // fire the first step unawaited; each step fires the next as a genuinely
    // new invocation, so no single call risks the 30s budget. result.reply
    // above already told the user "פותח הזמנה..."; the final result arrives
    // as a follow-up message once the chain completes.
    if (result.checkoutSession) {
      fireNextCheckoutStep({
        uid: link.uid,
        checkoutId: result.checkoutSession.checkoutId,
        telegramChatId: message.chat.id,
        batchIndex: 0,
      })
    }

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram Webhook] Error:', errMsg)
    try {
      if (message?.chat?.id) {
        await sendMessage(message.chat.id, 'שגיאה בעיבוד ההודעה. נסה שוב.')
      }
    } catch { /* don't throw from error handler */ }
  }

  return NextResponse.json({ ok: true })
}

export const POST = withServiceCall((req, ...args) => handler(req as NextRequest, ...args as []))

// --- Telegram-specific handlers ---

async function handleLinkCommand(message: TelegramMessage) {
  const parts = message.text!.replace(/^\/link(@\w+)?/, '/link').split(' ')
  if (parts.length < 2) {
    await sendMessage(message.chat.id,
      `שימוש: /link <קוד>\nאת הקוד תמצא בהגדרות של ${VARIANT_CONFIG.name}.`
    )
    return
  }

  const code = parts[1].trim()
  const firestore = getAdminFirestore()

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

  const linkData = {
    telegramUserId,
    telegramChatId: chatId,
    chatType,
    uid,
    linkedAt: new Date().toISOString(),
    displayName: message.from!.first_name || '',
  }

  const linkId = `${telegramUserId}_${chatId}`
  await firestore.collection('telegramLinks').doc(linkId).set(linkData)
  await firestore.collection('telegramLinkCodes').doc(code).delete()

  const chatLabel = chatType === 'private' ? 'צ\'אט פרטי' : `קבוצה "${message.chat.title}"`
  await sendMessage(chatId, `חשבון חובר בהצלחה (${chatLabel}). אפשר להתחיל!`)

  console.log(`[Telegram] Linked telegram=${telegramUserId} chat=${chatId} → uid=${uid}`)
}

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

async function resolveLink(telegramUserId: number, chatId: number) {
  const firestore = getAdminFirestore()

  const linkId = `${telegramUserId}_${chatId}`
  const doc = await firestore.collection('telegramLinks').doc(linkId).get()
  if (doc.exists) return doc.data() as { uid: string }

  const groupQuery = await firestore
    .collection('telegramLinks')
    .where('telegramChatId', '==', chatId)
    .limit(1)
    .get()

  if (!groupQuery.empty) {
    return groupQuery.docs[0].data() as { uid: string }
  }

  const privateLinkId = `${telegramUserId}_${telegramUserId}`
  const privateDoc = await firestore.collection('telegramLinks').doc(privateLinkId).get()
  if (privateDoc.exists) return privateDoc.data() as { uid: string }

  return null
}

async function handleCallbackQuery(query: TelegramCallbackQuery) {
  const data = query.data || ''
  if (!data.startsWith('p:')) {
    await answerCallbackQuery(query.id)
    return
  }

  const parts = data.split(':')
  if (parts.length !== 3) {
    await answerCallbackQuery(query.id, 'שגיאה')
    return
  }

  const searchKey = parts[1]
  const resultIndex = parseInt(parts[2], 10)
  const chatId = query.message?.chat.id
  if (!chatId) return

  const uid = (await resolveLink(query.from.id, chatId))?.uid
  if (!uid) {
    await answerCallbackQuery(query.id, 'חשבון לא מחובר')
    return
  }

  try {
    const result = await selectProduct(uid, searchKey, resultIndex)
    await answerCallbackQuery(query.id, `נוסף ל${result.target}`)
    await sendMessage(chatId, result.message)
    console.log(`[Telegram] Product picked: searchKey=${searchKey} idx=${resultIndex}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה'
    await answerCallbackQuery(query.id, msg)
  }
}
