// One-time migration: normalize date and amount fields on existing
// transaction rows so the schema matches what new parsers produce.
// Idempotent — re-running on already-normalized rows is a no-op.

import { db } from '@/app/db/financeDB'
import { normalizeAmount, normalizeDate } from '@/app/utils/parsers/shared'

const FLAG_KEY = 'migration.normalizeTransactionDates.v1'

export async function migrateTransactionDateFormats(): Promise<{
  updated: number
  skipped: number
}> {
  let updated = 0
  let skipped = 0

  const rows = await db.transactions.toArray()

  for (const t of rows) {
    if (t.id === undefined) {
      skipped++
      continue
    }

    const newDate = normalizeDate(t.date)
    const newCharging = normalizeDate(t.chargingDate)
    const newAmount = normalizeAmount(t.amount)

    const dateChanged = newDate !== undefined && newDate !== t.date
    const chargingChanged = newCharging !== t.chargingDate
    const amountChanged = newAmount !== t.amount

    if (!dateChanged && !chargingChanged && !amountChanged) {
      skipped++
      continue
    }

    const patch: Partial<typeof t> = {
      updatedAt: new Date().toISOString(),
    }
    if (dateChanged && newDate !== undefined) {
      patch.date = newDate
    }
    if (chargingChanged) {
      // newCharging may be undefined if t.chargingDate was empty string;
      // preserve the original semantic — only set when we have a value.
      patch.chargingDate = newCharging
    }
    if (amountChanged) {
      patch.amount = newAmount
    }

    // Some legacy rows carry an older `lastUpdated` — bump it too so
    // sync resolution treats this row as freshly modified.
    const legacy = t as unknown as { lastUpdated?: string }
    if (legacy.lastUpdated) {
      ;(patch as unknown as { lastUpdated: string }).lastUpdated = patch.updatedAt as string
    }

    await db.transactions.update(t.id, patch)
    updated++
  }

  return { updated, skipped }
}

/**
 * Run the migration once per device. Persists a flag in appSettings so
 * subsequent boots skip the work.
 */
export async function runNormalizeTransactionsOnce(): Promise<void> {
  try {
    const existing = await db.appSettings.where('key').equals(FLAG_KEY).first()
    if (existing) return

    const result = await migrateTransactionDateFormats()
    console.log(
      `[migration:${FLAG_KEY}] updated ${result.updated} transactions, skipped ${result.skipped}`
    )

    await db.appSettings.add({
      key: FLAG_KEY,
      value: { ranAt: new Date().toISOString(), ...result },
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error(`[migration:${FLAG_KEY}] failed:`, error)
  }
}
