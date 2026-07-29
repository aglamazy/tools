// One-time migration: copies subjectStore (localStorage key `finance-categories`)
// and timerStore (localStorage key `harvest-active-timer`) into their new
// Dexie-backed homes (`subjects`/`subjectClassifications` tables, and
// appSettings key `activeTimer`). See financeDB.ts's Subject/SubjectClassification
// docs for why: localStorage stores sync by whole-blob overwrite, which wiped
// every business-scoped subject on 2026-07-11 (incident, surface-fixed in
// da3f4f6) — only a real Dexie synced table gets per-record merge + a
// deletion tombstone ledger.
//
// The old localStorage keys are intentionally left in place after migrating —
// nothing reads them anymore once this has run, and leaving them is a free
// safety net (nothing to lose by not deleting).
import { db } from '@/app/db/financeDB'
import { convertLegacySubjectStoreBlob } from './legacySubjectStoreConversion'
import { remapLegacyFks } from './remapLegacyFks'

const FLAG_KEY = 'migration.legacyLocalStorageStores.v1'
const SUBJECT_STORAGE_KEY = 'finance-categories'
const TIMER_STORAGE_KEY = 'harvest-active-timer'

export async function migrateLegacyLocalStorageStores(): Promise<{
  subjects: number
  subjectClassifications: number
  timer: boolean
}> {
  let subjectsCount = 0
  let classificationsCount = 0
  let timerMigrated = false

  // eslint-disable-next-line no-restricted-syntax
  const rawSubjects = localStorage.getItem(SUBJECT_STORAGE_KEY)
  if (rawSubjects) {
    const blob = JSON.parse(rawSubjects)
    const { subjects, subjectClassifications } = convertLegacySubjectStoreBlob(blob)
    // The localStorage blob predates the FK int->syncId migration (2026-07-28)
    // and is intentionally left in place forever as a safety net — meaning
    // this function can run again on any freshly (re)created local IndexedDB
    // (a device wipe, a cloud restore, etc.), long after the v34 schema
    // upgrade already ran once and will never run again. Without this
    // normalization pass, businessId/transactionId here would stay stale
    // local ints forever, invisible to the FK migration. Idempotent — a
    // no-op once these fields are already syncId strings.
    const { stores: normalized, warnings } = remapLegacyFks({
      subjects,
      subjectClassifications,
      businesses: await db.businesses.toArray(),
      transactions: await db.transactions.toArray(),
    })
    if (warnings.length > 0) {
      console.warn(`[migrateLegacyLocalStorageStores] FK remap: ${warnings.length} warning(s):\n${warnings.join('\n')}`)
    }
    if (normalized.subjects.length > 0) {
      await db.subjects.bulkPut(normalized.subjects)
      subjectsCount = normalized.subjects.length
    }
    if (normalized.subjectClassifications.length > 0) {
      await db.subjectClassifications.bulkPut(normalized.subjectClassifications)
      classificationsCount = normalized.subjectClassifications.length
    }
  }

  // eslint-disable-next-line no-restricted-syntax
  const rawTimer = localStorage.getItem(TIMER_STORAGE_KEY)
  if (rawTimer) {
    const timer = JSON.parse(rawTimer)
    const existing = await db.appSettings.where('key').equals('activeTimer').first()
    if (!existing) {
      await db.appSettings.add({ key: 'activeTimer', value: timer, updatedAt: new Date().toISOString() })
      timerMigrated = true
    }
  }

  return { subjects: subjectsCount, subjectClassifications: classificationsCount, timer: timerMigrated }
}

/** Run the migration once per device. Persists a flag in appSettings so subsequent boots skip the work. */
export async function runMigrateLegacyLocalStorageStoresOnce(): Promise<void> {
  try {
    const existing = await db.appSettings.where('key').equals(FLAG_KEY).first()
    if (existing) return

    const result = await migrateLegacyLocalStorageStores()
    console.log(`[migration:${FLAG_KEY}] migrated ${result.subjects} subjects, ${result.subjectClassifications} classifications, timer=${result.timer}`)

    await db.appSettings.add({
      key: FLAG_KEY,
      value: { ranAt: new Date().toISOString(), ...result },
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error(`[migration:${FLAG_KEY}] failed:`, error)
  }
}
