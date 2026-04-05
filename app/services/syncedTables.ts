/**
 * Single source of truth for all IndexedDB tables included in backup/sync.
 *
 * IMPORTANT: When adding a new table to the database that should be synced,
 * add it here. All sync services (backup, merge, apply, dedup) read from this list.
 * An ESLint rule (no-inline-table-lists) guards against creating separate lists.
 */

import { db } from '@/app/db/financeDB'

/**
 * All IndexedDB tables that participate in backup/sync.
 * Order: parents before children (FK-safe for insert).
 */
export const SYNCED_DB_TABLES = [
  'businesses',
  'categories',
  'appSettings',
  'businessCategories',
  'importedFiles',
  'transactions',
  'tasks',
  'financialInstitutions',
  'capitalEntries',
  'ypayDocuments',
  'projects',
  'harvestTasks',
  'timeEntries',
  'taxDocuments',
  'advancePayments',
  'businessTasks',
] as const

export type SyncedTableName = (typeof SYNCED_DB_TABLES)[number]

/** Get Dexie Table references for use in db.transaction() */
export function getSyncedDexieTables() {
  return SYNCED_DB_TABLES.map((name) => (db as any)[name])
}
