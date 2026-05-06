// CALLER-KEYED ROUTE
/**
 * GET /api/grocery/cron — scheduled grocery order cycle.
 * Called by Vercel cron. Checks all users with a grocery schedule
 * and performs the appropriate action for the current day/time.
 *
 * Iterates per-user × per-store using the multi-store layer
 * (groceries/{uid}/stores/{storeId}). The legacy single-store doc
 * (groceries/{uid} root) is no longer read by this cron.
 *
 * Flow per (user, store):
 *   Order day morning  → merge list, plugin.checkout(), notify via Telegram
 *   Review time        → send list summary, ask for last changes
 *   Post-delivery      → notify, reset cycle
 *
 * NOTE: The legacy root doc fields (standingList/pendingChanges/orderCycle)
 * are no longer read or written. A manual cleanup is required to purge
 * stale fields from `groceries/{uid}`; the cron will not do it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import {
  getStoreData,
  mergeStoreList,
  setStoreOrderCycle,
  filterActivePending,
  sweepStorePending,
} from '@/app/services/grocery/groceryStoreMulti'
import { getStore, getAllStores } from '@/app/services/grocery/storeRegistry'
import { initStores } from '@/app/services/grocery/initStores'
import {
  preflightOrderSafety,
  finalizeOrderSuccess,
  finalizeOrderFailure,
  checkOrderSize,
} from '@/app/services/grocery/orderSafety'
import { sendMessage } from '@/app/services/telegram/telegramClient'
import { withTimeout } from '@/app/services/grocery/timeoutUtil'

export const maxDuration = 60

// Vercel cron auth
const CRON_SECRET = process.env.CRON_SECRET

/**
 * Best-effort Telegram notification. A stale chatId ("chat not found", user
 * blocked bot, etc.) is a per-user state issue, not a cron infrastructure
 * failure — log it, but don't let it propagate into `results` and trip the
 * /fail healthcheck ping for every run until the user relinks.
 */
async function notify(chatId: number | null, text: string): Promise<void> {
  if (!chatId) return
  try {
    await sendMessage(chatId, text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[Grocery Cron] Telegram notify failed chat=${chatId}: ${msg}`)
  }
}

export async function GET(request: NextRequest) {
  // Variant gate: when grocery automation is moved to a sibling deployment
  // (e.g. Saliko), Aglamazo's deployment can disable its grocery cron via
  // env without touching code. Default = enabled. Anything other than the
  // exact string 'false' keeps the cron live.
  if (process.env.GROCERY_CRON_ENABLED === 'false') {
    return NextResponse.json({ ok: true, skipped: 'GROCERY_CRON_ENABLED=false' })
  }

  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hcUrl = process.env.HEALTHCHECK_GROCERY_CRON_URL

  try {
    return await runCron(hcUrl)
  } catch (err) {
    // Infra-level failure: the cron route itself blew up before it could
    // iterate users. Surface this to healthchecks.io as a real /fail.
    console.error('[Grocery Cron] Infra error:', err)
    if (hcUrl) await fetch(`${hcUrl}/fail`).catch(() => {})
    throw err
  }
}

async function runCron(hcUrl: string | undefined) {
  initStores()

  const firestore = getAdminFirestore()
  const groceryDocs = await firestore.collection('groceries').get()

  const results: { uid: string; storeId: string; action: string; ok: boolean; error?: string }[] = []

  const now = new Date()
  const currentDay = now.getDay() // 0=Sun
  // NOTE: getHours() uses the server's local time. On Vercel that's UTC, which
  // is 2-3h behind Israel time. The 08:00-10:00 window is therefore effectively
  // 10:00/11:00 local on cron days. Fragile if the deployment region changes;
  // left as-is per task scope.
  const currentHour = now.getHours()

  const storeIds = getAllStores().map(s => s.id)

  for (const doc of groceryDocs.docs) {
    const uid = doc.id
    const chatId = await getTelegramChatId(uid)

    for (const storeId of storeIds) {
      // Per-iteration body as an async IIFE so we can wrap it in a 25s
      // timeout. The outer timeout is a belt — the inner locks/safety-gate
      // are the suspenders. If the body throws, the outer try/catch below
      // records the error and the loop continues to the next iteration.
      const iteration = (async (): Promise<void> => {
        const data = await getStoreData(uid, storeId)
        if (!data.schedule) return // user hasn't configured this store

        const { orderDay, preferredSlot, reviewReminderHours } = data.schedule

        // --- ORDER DAY: open order + checkout ---
        if (currentDay === orderDay && currentHour >= 8 && currentHour < 10) {
          const plugin = getStore(storeId)
          if (!plugin) {
            results.push({ uid, storeId, action: 'unknown_store', ok: false, error: `plugin "${storeId}" not registered` })
            return
          }

          // Only consider pending entries whose validTo has not yet expired.
          const activePending = filterActivePending(data.pendingChanges, now)
          const mergedMap = mergeStoreList(data.standingList, activePending)
          const merged = Object.values(mergedMap)

          // Defensive guard: never place a tiny auto-order. Runs BEFORE the
          // safety gate — no point taking a lock for an order we'd skip anyway.
          const sizeCheck = checkOrderSize(merged)
          if (!sizeCheck.ok) {
            console.warn(`[Grocery Cron] Safety: uid=${uid} store=${storeId} decision=size-skip`)
            await notify(chatId, `⚠️ דילגתי על הזמנה אוטומטית ב${plugin.label}: ${sizeCheck.reason}. אפשר להוסיף פריטים ולהריץ ידנית.`)
            results.push({ uid, storeId, action: 'skip_tiny', ok: true })
            return
          }
          const withId = merged.filter(i => i.catalogId)

          // --- Safety gate: idempotency + lock + pre-flight live check ---
          const gate = await preflightOrderSafety({ uid, storeId, plugin, now })
          console.log(`[Grocery Cron] Safety: uid=${uid} store=${storeId} decision=${gate.decision}`)
          if (gate.skipped) {
            if (gate.decision === 'linked-existing') {
              await notify(chatId, `🔗 מצאתי הזמנה קיימת ב${plugin.label} (#${gate.orderId}), סימנתי אותה כהזמנה של השבוע.`)
              results.push({ uid, storeId, action: 'linked_existing', ok: true })
            } else if (gate.decision === 'already-placed') {
              results.push({ uid, storeId, action: 'already_placed', ok: true })
            } else {
              results.push({ uid, storeId, action: 'locked_by_other_run', ok: true })
            }
            return
          }

          const items = withId.map(i => ({
            code: i.catalogId!,
            qty: i.qty,
            sellingUnitId: i.sellingUnitId,
          }))

          try {
            const result = await plugin.checkout(uid, items, {
              day: preferredSlot.day,
              time: preferredSlot.time?.split('-')[0],
            })

            if (result.success) {
              await finalizeOrderSuccess({
                uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now,
                orderId: result.orderId,
                slot: result.deliveryWindow,
              })
              // Single-shot pending entries (no validTo) belonged to this order and
              // are done. Dated entries still in the future are preserved.
              await sweepStorePending(uid, storeId, now)

              const itemList = merged.map(i => `• ${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join('\n')
              await notify(chatId,
                `🛒 הזמנה נפתחה ב${plugin.label}!\n` +
                `משלוח: ${result.deliveryWindow?.day} ${result.deliveryWindow?.date} ${result.deliveryWindow?.time}\n` +
                `מספר הזמנה: #${result.orderId || '---'}\n\n` +
                `${itemList}\n\n` +
                `אפשר לשנות עד שהזמנה ננעלת.`
              )
              results.push({ uid, storeId, action: 'checkout', ok: true })
            } else {
              await finalizeOrderFailure({
                uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now,
                error: result.error || 'unknown',
              })
              await notify(chatId, `⚠️ שגיאה בפתיחת הזמנה ב${plugin.label}: ${result.error}`)
              results.push({ uid, storeId, action: 'checkout', ok: false, error: result.error })
            }
          } catch (checkoutErr) {
            const msg = checkoutErr instanceof Error ? checkoutErr.message : String(checkoutErr)
            await finalizeOrderFailure({
              uid, storeId, idempotencyKey: gate.idempotencyKey, cycle: gate.cycle, now,
              error: msg,
            })
            throw checkoutErr
          }
          return
        }

        // --- REVIEW REMINDER & POST-DELIVERY ---
        const cycle = data.orderCycle
        if (cycle && (cycle.status === 'active' || cycle.status === 'review') && cycle.slot) {
          const deliveryDate = parseDeliveryDate(cycle.slot.date, cycle.slot.time)
          if (deliveryDate) {
            const hoursUntilDelivery = (deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60)
            const plugin = getStore(storeId)
            const storeLabel = plugin?.label || storeId

            // Send review reminder at the configured time
            if (
              cycle.status === 'active' &&
              hoursUntilDelivery > 0 &&
              hoursUntilDelivery <= reviewReminderHours &&
              hoursUntilDelivery > reviewReminderHours - 2
            ) {
              await setStoreOrderCycle(uid, storeId, { ...cycle, status: 'review', updatedAt: now.toISOString() })

              await notify(chatId,
                `📋 תזכורת (${storeLabel}) — משלוח מגיע ${cycle.slot.day} ${cycle.slot.time}.\n` +
                `שינויים אחרונים? כתבו כאן.`
              )
              results.push({ uid, storeId, action: 'review_reminder', ok: true })
            }

            // Post-delivery: reset cycle. Sweep (not clear) so future-dated
            // standing instructions survive across deliveries.
            if (hoursUntilDelivery < -2) {
              await setStoreOrderCycle(uid, storeId, { ...cycle, status: 'delivered', updatedAt: now.toISOString() })
              await sweepStorePending(uid, storeId, now)

              await notify(chatId, `📦 ההזמנה מ${storeLabel} הגיעה? מקווה שהכל בסדר!`)
              results.push({ uid, storeId, action: 'post_delivery', ok: true })
            }
          }
        }
      })()

      try {
        // 45s leaves a 15s buffer under maxDuration=60s. The 25s cap was too
        // tight: cartClear×N + cartAdd×N for a full Shufersal order routinely
        // takes ~20-25s alone (each call is one round-trip to Shufersal),
        // and the 2026-04-28 08:00 UTC firing died after 3/8 cartAdds.
        await withTimeout(iteration, 45_000, `cron uid=${uid} store=${storeId}`)
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        if (/timeout after /.test(errMsg)) {
          console.error(`[Grocery Cron] Iteration timeout uid=${uid} store=${storeId}`)
          // Do NOT clear lockedAt here — orderSafety.finalizeOrderFailure (when
          // the underlying call eventually settles) is the lock suspender; this
          // outer timeout is only the belt that lets the run as a whole finish.
          results.push({ uid, storeId, action: 'timeout', ok: false, error: 'iteration timeout' })
        } else {
          console.error(`[Grocery Cron] Error for uid=${uid} store=${storeId}:`, errMsg)
          results.push({ uid, storeId, action: 'error', ok: false, error: errMsg })
        }
      }
    }
  }

  console.log(`[Grocery Cron] Processed ${results.length} actions`)

  // Healthchecks.io semantics: a successful ping means the cron ran end-to-end,
  // not that every per-user action succeeded. Per-iteration failures (slow
  // store APIs that exceed `withTimeout`, plugin.checkout returning
  // success:false, stale Telegram chats) are per-user state issues — they're
  // recorded in `results` and notified to the user, but they MUST NOT trip
  // /fail, because that buries the signal we actually want from the probe
  // ("is the cron firing on schedule?") under per-user noise.
  // Real infra failures (Firestore unreachable, route crash) are caught by
  // the outer try/catch in GET() and routed to /fail.
  if (hcUrl) await fetch(hcUrl).catch(() => {})

  return NextResponse.json({ ok: true, results })
}

/**
 * Resolve uid → Telegram chatId for notifications.
 * A user can have multiple links (private + group(s)). Cron messages are
 * personal, so prefer the private chat. Without this preference a leftover
 * group/test link can win the `limit(1)` lottery and silently swallow every
 * notification — happened in 2026-05 with chatId -100999 ("Test" group).
 */
async function getTelegramChatId(uid: string): Promise<number | null> {
  const firestore = getAdminFirestore()
  const query = await firestore
    .collection('telegramLinks')
    .where('uid', '==', uid)
    .get()

  if (query.empty) return null
  const docs = query.docs.map(d => d.data() as { telegramChatId: number; chatType?: string })
  const privateLink = docs.find(d => d.chatType === 'private')
  return (privateLink ?? docs[0]).telegramChatId
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
