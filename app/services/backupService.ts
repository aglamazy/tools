/**
 * Backup and Restore Service
 * Each store exports and imports its own data
 *
 * IMPORTANT: Sync is TIER-AGNOSTIC
 * ================================
 * All stores are always backed up and restored regardless of user's current tier.
 * Tier only controls UI visibility (which features user can access), NOT data storage.
 *
 * This ensures:
 * - No data loss when user is downgraded (temporarily or permanently)
 * - Data created at higher tier remains in backup, just hidden in UI
 * - Upgrading tier makes previously hidden data accessible again
 *
 * DO NOT add tier-based filtering to export/import functions.
 */

import { db } from '@/app/db/financeDB'
import { initializeAppSettings } from '@/app/services/appSettingsService'
import { SYNCED_DB_TABLES } from './syncedTables'
import { convertLegacySubjectStoreBlob } from './migrations/legacySubjectStoreConversion'
import { remapLegacyFks } from './migrations/remapLegacyFks'

// Keys we must never ship to cloud backup. Refresh tokens are device-scoped
// (and security-sensitive); if they get synced and then merged back over a
// fresh device's tokens, the active session loses its silent-refresh path
// and Gmail/Drive/Calendar surface a "please log in again" popup mid-session.
// The `google_` prefix matches the keys defined in googleTokenService.ts
// (KEY_ACCESS_TOKEN, KEY_REFRESH_TOKEN, KEY_TOKEN_EXPIRY).
function shouldSkipAppSettingForBackup(row: any): boolean {
  const key = String(row?.key || '')
  return key.startsWith('google_')
}


export interface BackupData {
  version: string
  timestamp: string
  stores: {
    // IndexedDB tables
    transactions: any[]
    importedFiles: any[]
    categories: any[]
    businessCategories: any[]
    tasks: any[]
    appSettings: any[]
    businesses: any[]
    projects: any[]
    harvestTasks: any[]
    timeEntries: any[]
    capitalEntries: any[]
    financialInstitutions: any[]
    ypayDocuments: any[]
    taxDocuments?: any[]
    businessTasks?: any[]
    expenseDocuments?: any[]
    advancePayments?: any[]
    vatPayments?: any[]
    subjects?: any[]
    subjectClassifications?: any[]
    // Legacy shape, kept optional so an OLD backup file (from before the
    // subjectStore/timerStore → Dexie migration) can still be restored —
    // see importAllStores' backward-compat block. Never written anymore.
    subjectStore?: any
    timerStore?: any
  }
}

/**
 * Export all data from all stores
 */
export async function exportAllStores(): Promise<BackupData> {
  try {
    // Export all synced DB tables (single source of truth: syncedTables.ts).
    // Strip device-local Google OAuth tokens from appSettings — they must
    // never travel through cloud backup (see shouldSkipAppSettingForBackup).
    const tableArrays = await Promise.all(
      SYNCED_DB_TABLES.map((name) => (db as any)[name].toArray())
    )
    const stores: any = {}
    SYNCED_DB_TABLES.forEach((name, i) => {
      if (name === 'appSettings') {
        stores[name] = tableArrays[i].filter((r: any) => !shouldSkipAppSettingForBackup(r))
      } else {
        stores[name] = tableArrays[i]
      }
    })

    // subjects/subjectClassifications (ex-subjectStore) and the activeTimer
    // appSettings row (ex-timerStore) are already covered by the generic
    // SYNCED_DB_TABLES loop above — nothing bespoke to export anymore.

    return {
      // 2.0 (2026-07-28): FK fields hold syncId (UUID) instead of local
      // auto-increment ints — see remapLegacyFks.ts / schemaVersions.ts v34.
      // Marker only, nothing branches on it (hard cutover, no dual-shape
      // support) — kept because it's a cheap, honest record of the shape.
      version: '2.0',
      timestamp: new Date().toISOString(),
      stores,
    }
  } catch (error) {
    console.error('Error exporting data:', error)
    throw error
  }
}

/**
 * Check if local data is empty — true only if ALL synced tables are empty.
 */
export async function isLocalDataEmpty(): Promise<boolean> {
  const counts = await Promise.all(
    SYNCED_DB_TABLES.map(name => (db as any)[name].count())
  )
  return counts.every(c => c === 0)
}

/**
 * Import all data from backup
 */
export async function importAllStores(backup: BackupData): Promise<void> {
  try {
    // Normalize any FK fields still holding a local int (a backup file taken
    // before the 2026-07-28 syncId migration) to the new syncId-based shape
    // before writing anything — this is the only remaining full-replace entry
    // point that bypasses the generic merge, so it's the one place that must
    // stay self-healing for an old file (e.g. one sitting in Downloads from
    // before the cutover). Idempotent — a no-op for an already-migrated
    // file — so it's always safe to run rather than gated on detecting age.
    const { stores, warnings: fkRemapWarnings } = remapLegacyFks((backup.stores as any) || {})
    if (fkRemapWarnings.length > 0) {
      console.warn(`[BackupRestore] FK remap on import: ${fkRemapWarnings.length} warning(s):\n${fkRemapWarnings.join('\n')}`)
    }

    // Log counts for all synced tables
    const counts: Record<string, number> = {}
    for (const name of SYNCED_DB_TABLES) {
      counts[name] = (stores as any)[name]?.length ?? 0
    }
    console.log('[BackupRestore] importing backup', counts)

    if (counts.transactions === 0 || counts.importedFiles === 0) {
      console.warn('[BackupRestore] Cloud backup missing core data (transactions/importedFiles). Importing other tables only.', counts)
    }

    // Preserve local Google OAuth tokens across a full restore — the
    // clear()+bulkAdd cycle below would otherwise wipe them and force the
    // user to re-grant Gmail/Drive/Calendar consent. Tokens are device-local;
    // they must never travel through backup (see shouldSkipAppSettingForBackup).
    const localGoogleRows = (await db.appSettings.toArray())
      .filter((r: any) => shouldSkipAppSettingForBackup(r))

    // Clear and import all synced IndexedDB tables
    // Skip tables whose backup is empty (preserves local data)
    // Skip core tables (transactions/importedFiles) if backup looks incomplete
    const skipCore = counts.transactions === 0 || counts.importedFiles === 0
    const coreTables = new Set(['transactions', 'importedFiles'])
    for (const name of SYNCED_DB_TABLES) {
      let data = (stores as any)[name]
      if (!data || data.length === 0) continue
      if (skipCore && coreTables.has(name)) continue
      // Defensive: scrub google_* keys from a legacy backup that still has them.
      if (name === 'appSettings') {
        data = data.filter((r: any) => !shouldSkipAppSettingForBackup(r))
      }
      await (db as any)[name].clear()
      await (db as any)[name].bulkAdd(data)
    }

    // Restore the local Google tokens after the clear cycle.
    if (localGoogleRows.length > 0) {
      // bulkAdd would conflict on the (now-stale) auto-increment ids; use put
      // by key to upsert by the row content.
      for (const row of localGoogleRows) {
        const { id: _drop, ...rest } = row
        await db.appSettings.add(rest as any)
      }
    }

    // Backward-compat: a backup file taken before the subjectStore/timerStore
    // → Dexie migration still has the old shape. The generic loop above
    // already imported `subjects`/`subjectClassifications`/`appSettings` if
    // the backup HAS the new shape (counts.subjects > 0 etc, so the `!data ||
    // data.length === 0` guard skipped this legacy conversion entirely) — this
    // only fires for a genuinely old backup.
    if ((!counts.subjects || counts.subjects === 0) && stores.subjectStore) {
      const converted = convertLegacySubjectStoreBlob(stores.subjectStore)
      // This blob predates the syncId migration too (it's older than the
      // subjects table itself) — its businessId/transactionId FKs are still
      // local ints, so run them through the same normalization pass, reusing
      // the already-remapped businesses/transactions from `stores` above as
      // the lookup source.
      const { stores: normalized } = remapLegacyFks({
        subjects: converted.subjects,
        subjectClassifications: converted.subjectClassifications,
        businesses: (stores as any).businesses || [],
        transactions: (stores as any).transactions || [],
      })
      // Clear-then-add, not bulkAdd onto whatever's there: the boot-time
      // conversion (migrateLegacyLocalStorageStores) may have already
      // populated these tables from the device's own localStorage blob with
      // the SAME string primary keys — bulkAdd would abort the whole restore
      // on ConstraintError. Full-replace is this function's semantics anyway.
      if (normalized.subjects.length > 0) {
        await db.subjects.clear()
        await db.subjects.bulkAdd(normalized.subjects)
      }
      if (normalized.subjectClassifications.length > 0) {
        await db.subjectClassifications.clear()
        await db.subjectClassifications.bulkAdd(normalized.subjectClassifications)
      }
    }
    if (stores.timerStore) {
      const existingTimer = await db.appSettings.where('key').equals('activeTimer').first()
      if (!existingTimer) {
        await db.appSettings.add({ key: 'activeTimer', value: stores.timerStore, updatedAt: new Date().toISOString() })
      }
    }

    // Ensure new settings keys exist even if backup predates them
    await initializeAppSettings()

    console.log('✅ All data restored successfully')
  } catch (error) {
    console.error('Error importing data:', error)
    throw error
  }
}
