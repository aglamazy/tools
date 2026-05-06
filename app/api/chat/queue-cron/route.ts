// CALLER-KEYED ROUTE
/**
 * GET /api/chat/queue-cron — drains the LLM-failure retry queue.
 *
 * Each pending `chatQueue` entry is replayed through the chat brain ONLY when
 * its per-entry `nextRetryAt` has elapsed (exp-backoff schedule lives in
 * `chatQueue.ts#BACKOFF_SECONDS`). On success the recovered reply is
 * delivered to the original Telegram chat. On exhaustion we apologize and
 * fire `panicAdmin` — the only signal that "something is genuinely wrong
 * upstream" that's reliable enough to wake an admin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { processChatMessage } from '@/app/services/chatBrain'
import {
  listPendingEntries,
  recordFailedAttempt,
  deleteEntry,
  isExhausted,
  isDue,
  type ChatQueueEntry,
} from '@/app/services/chatQueue'
import { sendMessage } from '@/app/services/telegram/telegramClient'
import { panicAdmin } from '@/app/services/adminPanic'

const HISTORY_COLLECTION = 'telegramChatHistory'
const CRON_SECRET = process.env.CRON_SECRET

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const entries = await listPendingEntries()
  const now = new Date()
  const results: { id: string; outcome: string }[] = []

  for (const entry of entries) {
    try {
      if (isExhausted(entry)) {
        await notifyGiveUp(entry)
        await panicAdmin({
          source: 'cron-give-up',
          upstreamError: entry.lastError || 'unknown',
          uid: entry.uid,
          userTextSnippet: entry.text,
        })
        await deleteEntry(entry.id)
        results.push({ id: entry.id, outcome: 'gave_up' })
        continue
      }

      if (!isDue(entry, now)) {
        results.push({ id: entry.id, outcome: 'not_due' })
        continue
      }

      const replay = await processChatMessage({
        uid: entry.uid,
        text: entry.text,
        displayName: entry.displayName,
        historyCollection: HISTORY_COLLECTION,
        includeTasks: true,
      })

      if (replay.llmExhausted) {
        await recordFailedAttempt(entry.id, entry.attempts + 1, 'llm-exhausted')
        results.push({ id: entry.id, outcome: 'still_failing' })
        continue
      }

      // Success — deliver the recovered reply and clean up.
      await sendMessage(
        entry.telegramChatId,
        `↩️ חוזר להודעה ששלחת קודם:\n${replay.reply}`,
      )
      await deleteEntry(entry.id)
      results.push({ id: entry.id, outcome: 'delivered' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ChatQueue Cron] entry=${entry.id} error:`, msg)
      // Bump attempts so a permanently broken entry eventually exhausts and
      // gets cleaned up by the give-up path on a future tick.
      try { await recordFailedAttempt(entry.id, entry.attempts + 1, msg) }
      catch (writeErr) { console.warn(`[ChatQueue Cron] recordFailedAttempt failed:`, writeErr) }
      results.push({ id: entry.id, outcome: 'error' })
    }
  }

  console.log(`[ChatQueue Cron] Processed ${results.length} entries:`, results)
  return NextResponse.json({ ok: true, results })
}

async function notifyGiveUp(entry: ChatQueueEntry): Promise<void> {
  try {
    await sendMessage(
      entry.telegramChatId,
      '😔 לא הצלחתי לטפל בהודעה הקודמת שלך אחרי שעה של ניסיונות. הודעתי לאדמין. אפשר לנסח את הבקשה מחדש.',
    )
  } catch (err) {
    console.warn(`[ChatQueue Cron] give-up notify failed entry=${entry.id}:`, err)
  }
}
