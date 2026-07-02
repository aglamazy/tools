/**
 * adminPanic — server-only alert path for "the LLM is genuinely down" type
 * events. Triggers a Telegram message to a configured admin chatId.
 *
 * Anti-abuse: this MUST only be invoked from server-side code paths after a
 * server-observed upstream failure (e.g. exhausted LLM retry ladder, cron
 * give-up). It is never wired to client-controllable inputs. A global
 * Firestore-backed cooldown lock dedupes bursts: even if a thousand users
 * exhaust simultaneously the admin sees one ping per `throttleMinutes` window.
 *
 * Config lives in `platformSettings/panicConfig`:
 *   { adminTelegramChatId, throttleMinutes, lastFiredAt }
 *
 * Env override: `ADMIN_TELEGRAM_CHAT_ID` wins over the Firestore value, useful
 * for staging. Hardcoded fallback is the project owner's chat (5867887519).
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { sendMessage } from '@/app/services/telegram/telegramClient'

const SETTINGS_DOC = 'platformSettings'
const PANIC_DOC = 'panicConfig'
const DEFAULT_ADMIN_CHAT_ID = 5867887519
const DEFAULT_THROTTLE_MINUTES = 10

export interface PanicConfig {
  adminTelegramChatId: number
  throttleMinutes: number
  lastFiredAt?: string
}

export async function readPanicConfig(): Promise<PanicConfig> {
  const envOverride = process.env.ADMIN_TELEGRAM_CHAT_ID
  const doc = await getAdminFirestore().collection(SETTINGS_DOC).doc(PANIC_DOC).get()
  const data = (doc.exists ? doc.data() : null) as Partial<PanicConfig> | null
  return {
    adminTelegramChatId: envOverride
      ? Number(envOverride)
      : data?.adminTelegramChatId ?? DEFAULT_ADMIN_CHAT_ID,
    throttleMinutes: data?.throttleMinutes ?? DEFAULT_THROTTLE_MINUTES,
    lastFiredAt: data?.lastFiredAt,
  }
}

export interface UpdatePanicConfigInput {
  adminTelegramChatId?: number
  throttleMinutes?: number
}

export async function writePanicConfig(input: UpdatePanicConfigInput): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (typeof input.adminTelegramChatId === 'number') update.adminTelegramChatId = input.adminTelegramChatId
  if (typeof input.throttleMinutes === 'number') update.throttleMinutes = input.throttleMinutes
  await getAdminFirestore().collection(SETTINGS_DOC).doc(PANIC_DOC).set(update, { merge: true })
}

export interface PanicReason {
  /** Short tag for the failure source: 'webhook-exhaust' | 'cron-give-up' | 'web-exhaust' */
  source: string
  /** Server-observed error string from the upstream LLM call (NOT user input). */
  upstreamError: string
  /**
   * Optional incident severity. High-severity incidents bypass the normal
   * cooldown so they do not remain suppressed while a real customer-facing
   * fault is still live.
   */
  severity?: 'low' | 'medium' | 'high'
  /** Optional uid for context — included verbatim only because uids are opaque. */
  uid?: string
  /** Optional first chars of the user's message — truncated, for context only. */
  userTextSnippet?: string
}

/**
 * Best-effort admin notification, throttled. Returns true if the alert was
 * actually sent, false if suppressed (cooldown, no chatId, send failure).
 */
export async function panicAdmin(reason: PanicReason): Promise<boolean> {
  let config: PanicConfig
  try {
    config = await readPanicConfig()
  } catch (err) {
    console.error('[adminPanic] readPanicConfig failed:', err)
    return false
  }

  if (!config.adminTelegramChatId) {
    console.warn('[adminPanic] no adminTelegramChatId configured; skipping')
    return false
  }

  const bypassCooldown = reason.severity === 'high'
  const now = new Date()
  if (!bypassCooldown && config.lastFiredAt) {
    const lastMs = new Date(config.lastFiredAt).getTime()
    if (!Number.isNaN(lastMs)) {
      const elapsedMin = (now.getTime() - lastMs) / 60000
      if (elapsedMin < config.throttleMinutes) {
        console.log(
          `[adminPanic] throttled (${elapsedMin.toFixed(1)}min < ${config.throttleMinutes}min). source=${reason.source}`,
        )
        return false
      }
    }
  } else if (bypassCooldown) {
    console.log(`[adminPanic] high-severity bypass source=${reason.source}`)
  }

  // Reserve the cooldown slot BEFORE sending so a burst of concurrent panics
  // doesn't all pass the throttle check at once.
  try {
    await getAdminFirestore()
      .collection(SETTINGS_DOC)
      .doc(PANIC_DOC)
      .set({ lastFiredAt: now.toISOString() }, { merge: true })
  } catch (err) {
    console.warn('[adminPanic] lock write failed (proceeding anyway):', err)
  }

  const text = formatPanicMessage(reason, now)
  try {
    await sendMessage(config.adminTelegramChatId, text)
    console.warn(`[adminPanic] FIRED source=${reason.source} chat=${config.adminTelegramChatId}`)
    return true
  } catch (err) {
    console.error('[adminPanic] sendMessage failed:', err)
    return false
  }
}

function formatPanicMessage(reason: PanicReason, now: Date): string {
  const SNIPPET_MAX = 100
  const snippet = reason.userTextSnippet
    ? reason.userTextSnippet.slice(0, SNIPPET_MAX) + (reason.userTextSnippet.length > SNIPPET_MAX ? '…' : '')
    : ''
  const lines = [
    `🚨 Aglamazo LLM panic`,
    `מקור: ${reason.source}`,
    ...(reason.severity ? [`חומרה: ${reason.severity}`] : []),
    `שגיאת upstream: ${reason.upstreamError}`,
  ]
  if (reason.uid) lines.push(`uid: ${reason.uid}`)
  if (snippet) lines.push(`טקסט (קטוע): ${snippet}`)
  lines.push(`זמן: ${now.toISOString()}`)
  return lines.join('\n')
}
