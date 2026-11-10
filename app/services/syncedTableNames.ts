/**
 * Single source of truth for all IndexedDB tables included in backup/sync.
 *
 * IMPORTANT: every FinanceDB table is in exactly one of the two lists below.
 * A table in neither fails syncedTableNames.test.ts (aglamazo#472: students,
 * profileQAs, scoutConfigs, scoutResults were in neither and never left the device).
 * All sync services (backup, merge, apply, dedup, the deletion ledger hooks) read
 * SYNCED_DB_TABLES. An ESLint rule (no-inline-table-lists) guards against separate lists.
 *
 * No imports here: financeDB.ts imports this file.
 */

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
  'expenseDocuments',
  'projects',
  'harvestTasks',
  'timeEntries',
  'taxDocuments',
  'advancePayments',
  'businessTasks',
  'chats',
  'chatMessages',
  'credentials',
  'vatPayments',
  'suppliers',
  'subjects',
  'subjectClassifications',
  // aglamazo#472: all four reference their business by Business.syncId (stable across devices).
  'students',
  'profileQAs',
  'scoutConfigs',
  'scoutResults',
] as const

/**
 * Tables kept on this device on purpose, never synced.
 * - deviceAccount: which account owns this browser's local data
 *   (deviceAccountReconciler.ts). Syncing it would copy one device's owner onto another
 *   and defeat the account-switch wipe it exists for.
 */
export const DEVICE_LOCAL_DB_TABLES = ['deviceAccount'] as const
