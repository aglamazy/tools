// CALLER-KEYED ROUTE
/**
 * GET /api/grocery/cron — scheduled grocery order cycle.
 * Called by Vercel cron. Checks all users with a grocery schedule
 * and performs the appropriate action for the current day/time.
 *
 * Flow per user:
 *   Order day morning  → merge list, checkout on Shufersal, notify via Telegram
 *   Review time        → send list summary, ask for last changes
 *   Post-delivery      → notify, reset cycle
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { getGroceryData, mergeList, setOrderCycle, clearPending, type OrderCycle } from '@/app/services/grocery/groceryStore'
import { checkout, listSlots } from '@/app/services/grocery/shufersalClient'
import { sendMessage } from '@/app/services/telegram/telegramClient'

// Vercel cron auth
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const firestore = getAdminFirestore()
  const groceryDocs = await firestore.collection('groceries').get()

  const results: { uid: string; action: string; ok: boolean; error?: string }[] = []

  const now = new Date()
  const currentDay = now.getDay() // 0=Sun
  const currentHour = now.getHours()

  for (const doc of groceryDocs.docs) {
    const uid = doc.id
    try {
      const data = await getGroceryData(uid)
      if (!data.schedule) continue

      const chatId = await getTelegramChatId(uid)
      const { orderDay, preferredSlot, reviewReminderHours } = data.schedule

      // --- ORDER DAY: open order + checkout ---
      if (currentDay === orderDay && currentHour >= 8 && currentHour < 10) {
        if (data.orderCycle?.status === 'active') continue // already ordered this week

        const merged = mergeList(data.standingList, data.pendingChanges)
        if (merged.length === 0) {
          if (chatId) await sendMessage(chatId, 'הרשימה ריקה — לא פותח הזמנה השבוע.')
          results.push({ uid, action: 'skip_empty', ok: true })
          continue
        }

        const items = merged
          .filter(i => i.catalogId)
          .map(i => ({ code: i.catalogId!, qty: i.qty }))

        const result = await checkout(uid, items, {
          day: preferredSlot.day,
          time: preferredSlot.time?.split('-')[0],
        })

        if (result.success) {
          const cycle: OrderCycle = {
            status: 'active',
            orderId: result.orderId,
            slot: result.deliveryWindow,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          }
          await setOrderCycle(uid, cycle)

          if (chatId) {
            const itemList = merged.map(i => `• ${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join('\n')
            await sendMessage(chatId,
              `🛒 הזמנה נפתחה!\n` +
              `משלוח: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}\n` +
              `מספר הזמנה: #${result.orderId || '---'}\n\n` +
              `${itemList}\n\n` +
              `אפשר לשנות עד שהזמנה ננעלת בשופרסל.`
            )
          }
          results.push({ uid, action: 'checkout', ok: true })
        } else {
          if (chatId) {
            await sendMessage(chatId, `⚠️ שגיאה בפתיחת הזמנה: ${result.error}`)
          }
          results.push({ uid, action: 'checkout', ok: false, error: result.error })
        }
        continue
      }

      // --- REVIEW REMINDER & POST-DELIVERY ---
      const cycle = data.orderCycle
      if (cycle && (cycle.status === 'active' || cycle.status === 'review') && cycle.slot) {
        const deliveryDate = parseDeliveryDate(cycle.slot.date, cycle.slot.time)
        if (deliveryDate) {
          const hoursUntilDelivery = (deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60)

          // Send review reminder at the configured time
          if (cycle.status === 'active' && hoursUntilDelivery > 0 && hoursUntilDelivery <= reviewReminderHours && hoursUntilDelivery > reviewReminderHours - 2) {
            await setOrderCycle(uid, { ...cycle, status: 'review', updatedAt: now.toISOString() })

            if (chatId) {
              await sendMessage(chatId,
                `📋 תזכורת — משלוח מגיע ${cycle.slot.day} ${cycle.slot.time}.\n` +
                `שינויים אחרונים? כתבו כאן.`
              )
            }
            results.push({ uid, action: 'review_reminder', ok: true })
          }

          // Post-delivery: reset cycle
          if (hoursUntilDelivery < -2) {
            await setOrderCycle(uid, { ...cycle, status: 'delivered', updatedAt: now.toISOString() })
            await clearPending(uid)

            if (chatId) {
              await sendMessage(chatId, '📦 ההזמנה הגיעה? מקווה שהכל בסדר!')
            }
            results.push({ uid, action: 'post_delivery', ok: true })
          }
        }
      }

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[Grocery Cron] Error for uid=${uid}:`, errMsg)
      results.push({ uid, action: 'error', ok: false, error: errMsg })
    }
  }

  console.log(`[Grocery Cron] Processed ${results.length} actions`)

  // Ping healthchecks.io
  const hasErrors = results.some(r => !r.ok)
  const hcUrl = process.env.HEALTHCHECK_CRON_URL
  if (hcUrl) fetch(hasErrors ? `${hcUrl}/fail` : hcUrl).catch(() => {})

  return NextResponse.json({ ok: true, results })
}

/** Resolve uid → Telegram chatId for notifications. */
async function getTelegramChatId(uid: string): Promise<number | null> {
  const firestore = getAdminFirestore()
  const query = await firestore
    .collection('telegramLinks')
    .where('uid', '==', uid)
    .limit(1)
    .get()

  if (query.empty) return null
  return query.docs[0].data().telegramChatId as number
}

/** Parse DD/MM + time into a Date for the current/next occurrence. */
function parseDeliveryDate(dateStr: string, time?: string): Date | null {
  try {
    const [dd, mm] = dateStr.split('/').map(Number)
    const year = new Date().getFullYear()
    const hour = time ? parseInt(time.split(':')[0], 10) : 12
    return new Date(year, mm - 1, dd, hour)
  } catch {
    return null
  }
}
