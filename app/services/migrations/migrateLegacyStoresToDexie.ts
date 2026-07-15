/**
 * One-time copy of subjectStore's/timerStore's legacy localStorage data into
 * their new Dexie tables (#253 phase 1 — see app/stores/subjectStore.ts and
 * app/stores/timerStore.ts, now Dexie-backed).
 *
 * Idempotent: skipped per-store once its Dexie table already has rows, so it
 * never overwrites data written since via the new async API. The localStorage
 * key itself is left untouched — phase 3 removes it once every consumer has
 * moved off the legacy sync API.
 */
import { db } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { timerStore } from '@/app/stores/timerStore'

const ACTIVE_TIMER_KEY = 'active'

export async function migrateLegacyStoresToDexie(): Promise<void> {
  await Promise.all([migrateSubjectStore(), migrateTimerStore()])
}

async function migrateSubjectStore(): Promise<void> {
  try {
    const data = subjectStore.readLegacyLocalStorage()
    if (!data) return

    // Categories and classifications are guarded (and transacted) independently:
    // they're two different tables that can end up non-empty at different
    // times (e.g. a classification saved via the new async API before this
    // migration ever ran). A single shared transaction guarded only by
    // subjectCategories' emptiness would let a classifications-only conflict
    // (duplicate transactionId — unique index) abort the whole transaction,
    // silently rolling back a legitimate categories restore too.
    if (data.categories?.length && (await db.subjectCategories.count()) === 0) {
      await db.subjectCategories.bulkPut(data.categories)
    }
    if (data.classifications?.length && (await db.subjectClassifications.count()) === 0) {
      await db.subjectClassifications.bulkPut(data.classifications)
    }
  } catch (err) {
    console.error('Error migrating subjectStore to Dexie:', err)
  }
}

async function migrateTimerStore(): Promise<void> {
  try {
    const timer = timerStore.readLegacyLocalStorage()
    if (!timer) return
    if ((await db.activeTimer.count()) > 0) return

    await db.activeTimer.add({ key: ACTIVE_TIMER_KEY, ...timer })
  } catch (err) {
    console.error('Error migrating timerStore to Dexie:', err)
  }
}
