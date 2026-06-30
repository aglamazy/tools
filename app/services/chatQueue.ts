/**
 * chatQueue — Firestore-backed retry queue for Telegram chat messages whose
 * LLM call exhausted the in-line recovery ladder. A cron drains the queue
 * every 10 minutes; entries respect their own per-message `nextRetryAt` so
 * each retry waits the right exp-backoff delay regardless of cron cadence.
 *
 * The same backoff schedule mirrors the React polling on the web side
 * (defined in AppChat.tsx) so both surfaces feel consistent.
 *
 * Collection shape: `chatQueue/{auto-id}` →
 *   { uid, telegramChatId, displayName?, text,
 *     attempts, queuedAt, nextRetryAt, lastAttemptAt?, lastError? }
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

const COLLECTION = 'chatQueue'

/**
 * Exp-backoff delays (seconds) per attempt index. After the entry is enqueued,
 * the FIRST cron pickup waits BACKOFF_SECONDS[0] = 30s. Total elapsed across
 * all 7 entries ≈ 67 minutes, which is the cap we promised the user.
 */
export const BACKOFF_SECONDS = [30, 60, 120, 300, 600, 1200, 1800]
export const MAX_ATTEMPTS = BACKOFF_SECONDS.length

export interface ChatQueueEntry {
  id: string
  uid: string
  telegramChatId: number
  displayName?: string
  text: string
  attempts: number
  queuedAt: string
  nextRetryAt: string
  lastAttemptAt?: string
  lastError?: string
}

export interface EnqueueParams {
  uid: string
  telegramChatId: number
  displayName?: string
  text: string
}

/** Schedule next retry time given how many attempts have already been made. */
function nextRetryAtIso(attemptsSoFar: number, now: Date = new Date()): string {
  const idx = Math.min(attemptsSoFar, BACKOFF_SECONDS.length - 1)
  const delayMs = BACKOFF_SECONDS[idx] * 1000
  return new Date(now.getTime() + delayMs).toISOString()
}

export async function enqueueChatMessage(params: EnqueueParams): Promise<string> {
  const now = new Date()
  const ref = await getAdminFirestore().collection(COLLECTION).add({
    ...params,
    attempts: 0,
    queuedAt: now.toISOString(),
    nextRetryAt: nextRetryAtIso(0, now),
  })
  return ref.id
}

/** All entries — caller filters by `nextRetryAt <= now` in-memory. */
export async function listPendingEntries(): Promise<ChatQueueEntry[]> {
  const snap = await getAdminFirestore().collection(COLLECTION).get()
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ChatQueueEntry, 'id'>) }))
}

/** Bump attempts counter and schedule next retry per backoff. */
export async function recordFailedAttempt(id: string, attempts: number, lastError: string): Promise<void> {
  await getAdminFirestore().collection(COLLECTION).doc(id).update({
    attempts,
    lastAttemptAt: new Date().toISOString(),
    nextRetryAt: nextRetryAtIso(attempts),
    lastError,
  })
}

export async function deleteEntry(id: string): Promise<void> {
  await getAdminFirestore().collection(COLLECTION).doc(id).delete()
}

/**
 * True if the entry has exhausted its retry budget. We rely on attempts vs.
 * MAX_ATTEMPTS rather than a wall-clock TTL — the backoff schedule already
 * caps total elapsed time, and a stuck entry with too few attempts would
 * just cost one extra retry, not block forever.
 */
export function isExhausted(entry: ChatQueueEntry): boolean {
  return entry.attempts >= MAX_ATTEMPTS
}

/** True if it's time to retry (or the entry has no nextRetryAt for some reason). */
export function isDue(entry: ChatQueueEntry, now: Date = new Date()): boolean {
  if (!entry.nextRetryAt) return true
  return new Date(entry.nextRetryAt).getTime() <= now.getTime()
}
