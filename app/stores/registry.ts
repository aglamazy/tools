/**
 * Store Registry
 *
 * This file lists all stores that must be included in backup/restore operations.
 * ESLint rule ensures backupService.ts imports and uses all stores listed here.
 *
 * When adding a new store:
 * 1. Add it to this registry
 * 2. Update backupService.ts to export/import it
 * 3. ESLint will fail if backupService.ts doesn't include all registered stores
 */

// IndexedDB tables that need backup (from financeDB.ts)
export const INDEXEDDB_TABLES = [
  'transactions',
  'importedFiles',
  'categories',
  'businessCategories',
  'tasks',
  'appSettings',
  'businesses',
  'projects',
  'harvestTasks',
  'timeEntries',
] as const

// localStorage stores that need backup (have export/import methods)
export const LOCALSTORAGE_STORES = [
  'subjectStore',
  'historyStore',
  'timerStore',
] as const

// Stores that are transient/session-only (don't need backup)
export const TRANSIENT_STORES = [
  'driveAuthStore',  // OAuth tokens - user re-authenticates
] as const

export type IndexedDBTable = typeof INDEXEDDB_TABLES[number]
export type LocalStorageStore = typeof LOCALSTORAGE_STORES[number]
