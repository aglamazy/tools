/**
 * Single source of truth for all IndexedDB tables included in backup/sync.
 *
 * Sync helpers over SYNCED_DB_TABLES. The list itself is in syncedTableNames.ts: a new
 * FinanceDB table goes there, in SYNCED_DB_TABLES or DEVICE_LOCAL_DB_TABLES.
 */

import { db } from '@/app/db/financeDB'

// The list itself lives in syncedTableNames.ts (no imports) so financeDB.ts can use it for
// its deletion-ledger hooks without an import cycle (aglamazo#472).
export { SYNCED_DB_TABLES, DEVICE_LOCAL_DB_TABLES } from './syncedTableNames'
import { SYNCED_DB_TABLES } from './syncedTableNames'

export type SyncedTableName = (typeof SYNCED_DB_TABLES)[number]

/** Get Dexie Table references for use in db.transaction() */
export function getSyncedDexieTables() {
  return SYNCED_DB_TABLES.map((name) => (db as any)[name])
}

/**
 * Tables that have a secondary unique index (besides id/syncId), used for
 * content-aware dedup during merge — a cloud row whose primary key differs
 * from any local row but whose unique-indexed field matches an existing local
 * row must update-in-place rather than insert (otherwise Dexie throws
 * ConstraintError and aborts the whole sync transaction).
 *
 * This map is derived at runtime from the live Dexie schema rather than
 * hardcoded, so adding a new `&field` to a synced table's schema string
 * automatically participates in dedup. We use runtime introspection over
 * static parsing because Dexie itself is the source of truth and
 * `Table.schema.indexes` is a typed, stable API
 * (see node_modules/dexie/dist/dexie.d.ts: IndexSpec / TableSchema).
 *
 * Limitations the dedup logic can't currently express:
 *   - compound unique indexes (`&[a+b]`)
 *   - multiple secondary uniques on one table (we pick the first)
 * Both cases emit a one-time console.warn at first computation but never throw.
 */
let _uniqueKeyTablesCache: Record<string, string> | null = null

export function getUniqueKeyTables(): Record<string, string> {
  if (_uniqueKeyTablesCache) return _uniqueKeyTablesCache

  const result: Record<string, string> = {}
  const syncedSet = new Set<string>(SYNCED_DB_TABLES)

  for (const table of db.tables) {
    if (!syncedSet.has(table.name)) continue
    // schema.indexes excludes the primary key (primKey is separate), so every
    // entry here is a secondary index — exactly what we want.
    const secondaryUniques = table.schema.indexes.filter((idx) => idx.unique)
    if (secondaryUniques.length === 0) continue

    const singleField = secondaryUniques.filter((idx) => !idx.compound && typeof idx.keyPath === 'string')
    if (singleField.length === 0) {
      // Only compound unique indexes (e.g. `&[a+b]`) — dedup map can't express this.
      console.warn(
        `[SyncedTables] Table "${table.name}" has only compound unique indexes; ` +
        `dedup map can't express compound uniques, skipping.`,
      )
      continue
    }

    if (singleField.length > 1) {
      console.warn(
        `[SyncedTables] Table "${table.name}" has ${singleField.length} secondary unique ` +
        `indexes (${singleField.map((i) => i.keyPath as string).join(', ')}); ` +
        `dedup map supports only one — picking "${singleField[0].keyPath as string}".`,
      )
    }

    result[table.name] = singleField[0].keyPath as string
  }

  _uniqueKeyTablesCache = result
  return result
}
