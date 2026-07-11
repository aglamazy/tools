import { db } from '@/app/db/financeDB'
import type { ClaudeKeyReason } from '@/app/api/check-claude-key/route'

// Claude-key probe result, cached in appSettings (the sanctioned store — no raw
// localStorage). Key health is cheap to sync and identical across devices (same
// key), so appSettings is a fine home; the daily-alert timestamp lives here too
// so "once a day" holds fleet-wide, not per-device.
const HEALTH_KEY = 'claudeKeyHealth'
const ALERT_AT_KEY = 'claudeKeyAlertAt'
const STALE_MS = 24 * 60 * 60 * 1000 // re-probe at most once/day
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000 // bell at most once/day

export type ClaudeKeyHealth = {
  ok: boolean
  reason: ClaudeKeyReason | 'no-key'
  message: string
  checkedAt: string // ISO
  keyTail: string // last 4 chars of the probed key, to detect key changes
}

async function readSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.appSettings.where('key').equals(key).first()
  return row?.value as T | undefined
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  const existing = await db.appSettings.where('key').equals(key).first()
  if (existing) {
    await db.appSettings.update(existing.id!, { value, updatedAt: new Date().toISOString() })
  } else {
    await db.appSettings.add({ key, value, updatedAt: new Date().toISOString() })
  }
}

export async function getClaudeApiKey(): Promise<string> {
  return ((await readSetting<string>('claudeApiKey')) || '').trim()
}

function tailOf(key: string): string {
  return key.length >= 4 ? key.slice(-4) : key
}

export async function getCachedHealth(): Promise<ClaudeKeyHealth | null> {
  return (await readSetting<ClaudeKeyHealth>(HEALTH_KEY)) ?? null
}

/** Drop the cached health + alert cooldown (call when the key changes). */
export async function clearHealthCache(): Promise<void> {
  const h = await db.appSettings.where('key').equals(HEALTH_KEY).first()
  if (h) await db.appSettings.delete(h.id!)
  const a = await db.appSettings.where('key').equals(ALERT_AT_KEY).first()
  if (a) await db.appSettings.delete(a.id!)
}

/**
 * Return the key's health, probing Anthropic if the cache is missing, stale
 * (>1 day), or was taken against a different key. `force` re-probes regardless.
 * With no key set, returns a synthetic 'no-key' health (never probes).
 */
export async function getClaudeKeyHealth(opts?: { force?: boolean }): Promise<ClaudeKeyHealth> {
  const key = await getClaudeApiKey()
  if (!key) {
    return { ok: true, reason: 'no-key', message: '', checkedAt: new Date().toISOString(), keyTail: '' }
  }

  const cached = await getCachedHealth()
  const fresh = cached
    && cached.keyTail === tailOf(key)
    && Date.now() - new Date(cached.checkedAt).getTime() < STALE_MS
  if (fresh && !opts?.force) return cached!

  try {
    const res = await fetch('/api/check-claude-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
    })
    const data = await res.json()
    const h: ClaudeKeyHealth = {
      ok: !!data.ok,
      reason: data.reason,
      message: data.message || '',
      checkedAt: new Date().toISOString(),
      keyTail: tailOf(key),
    }
    await writeSetting(HEALTH_KEY, h)
    return h
  } catch {
    // Network/other failure probing — don't cache a false "dead" verdict.
    return { ok: true, reason: 'error', message: '', checkedAt: new Date().toISOString(), keyTail: tailOf(key) }
  }
}

/** True if a bad-key bell alert hasn't fired in the last day (and marks it fired). */
export async function claimDailyAlert(): Promise<boolean> {
  const last = await readSetting<string>(ALERT_AT_KEY)
  if (last && Date.now() - new Date(last).getTime() < ALERT_COOLDOWN_MS) return false
  await writeSetting(ALERT_AT_KEY, new Date().toISOString())
  return true
}
