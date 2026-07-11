#!/usr/bin/env node

/**
 * Check that syncedTables.ts (the single source of truth) includes all
 * IndexedDB tables that should be synced, and that backupService.ts
 * imports from it rather than maintaining its own list.
 *
 * Run: node scripts/check-backup-stores.js
 */

const fs = require('fs')
const path = require('path')

const SYNCED_TABLES_PATH = path.join(__dirname, '../app/services/syncedTables.ts')
const BACKUP_SERVICE_PATH = path.join(__dirname, '../app/services/backupService.ts')
const MERGE_SERVICE_PATH = path.join(__dirname, '../app/services/mergeService.ts')
const APPLY_SERVICE_PATH = path.join(__dirname, '../app/services/applyMergedBackupService.ts')

const syncedTablesContent = fs.readFileSync(SYNCED_TABLES_PATH, 'utf-8')
const backupServiceContent = fs.readFileSync(BACKUP_SERVICE_PATH, 'utf-8')
const mergeServiceContent = fs.readFileSync(MERGE_SERVICE_PATH, 'utf-8')
const applyServiceContent = fs.readFileSync(APPLY_SERVICE_PATH, 'utf-8')

// Extract table names from SYNCED_DB_TABLES array in syncedTables.ts
const tableMatches = syncedTablesContent.match(/SYNCED_DB_TABLES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)
if (!tableMatches) {
  console.error('❌ Could not parse SYNCED_DB_TABLES from syncedTables.ts')
  process.exit(1)
}
const syncedTables = [...tableMatches[1].matchAll(/'(\w+)'/g)].map(m => m[1])

const LOCALSTORAGE_STORES = [
  'subjectStore',
  'timerStore',
]

let hasErrors = false

console.log('Checking sync services use SYNCED_DB_TABLES from syncedTables.ts...\n')

// Check that syncedTables.ts has the expected tables
console.log(`syncedTables.ts defines ${syncedTables.length} tables:`)
console.log(`  ${syncedTables.join(', ')}\n`)

// Check that all 3 sync services import from syncedTables
console.log('Import checks:')
const services = [
  { name: 'backupService.ts', content: backupServiceContent },
  { name: 'mergeService.ts', content: mergeServiceContent },
  { name: 'applyMergedBackupService.ts', content: applyServiceContent },
]
for (const { name, content } of services) {
  if (content.includes("from './syncedTables'") || content.includes("from '@/app/services/syncedTables'")) {
    console.log(`  ✅ ${name} imports from syncedTables`)
  } else {
    console.log(`  ❌ ${name} does NOT import from syncedTables`)
    hasErrors = true
  }
}

// Check localStorage stores in backupService
console.log('\nlocalStorage stores in backupService.ts:')
for (const store of LOCALSTORAGE_STORES) {
  const hasExport = backupServiceContent.includes(`${store}.export()`)
  const hasImport = backupServiceContent.includes(`${store}.import(`)

  if (hasExport && hasImport) {
    console.log(`  ✅ ${store}`)
  } else {
    const missing = [
      !hasExport && 'export',
      !hasImport && 'import'
    ].filter(Boolean).join(', ')
    console.log(`  ❌ ${store} - missing: ${missing}`)
    hasErrors = true
  }
}

// Anomaly guard: a localStorage store is OUTSIDE the generic Dexie sync path
// (syncId-merge + deletion ledger), so its incremental-sync import MUST be a
// per-record MERGE, never a whole-blob overwrite. A blind overwrite let a
// thinner-but-newer remote clobber the local subjectStore and wiped every
// business-scoped subject (data-loss incident 2026-07-11). Enforce that the
// incremental sync (applyMergedBackupService) merges each localStorage store.
console.log('\nlocalStorage store sync-safety (must MERGE on incremental sync, not overwrite):')
for (const store of LOCALSTORAGE_STORES) {
  // timerStore is intentionally NOT imported on incremental sync (local timer
  // always wins) — only merged-into on full restore. Skip the merge assertion
  // for stores the incremental sync doesn't touch.
  const importedIncrementally = applyServiceContent.includes(`${store}.import(`)
  if (!importedIncrementally) {
    console.log(`  ⏭️  ${store} — not imported on incremental sync (skip)`)
    continue
  }
  // Require the merge option on the incremental-sync import call.
  const mergeRe = new RegExp(`${store}\\.import\\([^)]*merge\\s*:\\s*true`)
  if (mergeRe.test(applyServiceContent)) {
    console.log(`  ✅ ${store} — incremental sync uses { merge: true }`)
  } else {
    console.log(`  ❌ ${store} — incremental sync import is NOT a merge (overwrite = data-loss risk)`)
    hasErrors = true
  }
}

console.log('')

if (hasErrors) {
  console.error('❌ Data-store sync is not safe!')
  console.error('   - All sync services must import SYNCED_DB_TABLES from syncedTables.ts')
  console.error('   - Every localStorage store imported on incremental sync must MERGE (not overwrite).')
  process.exit(1)
} else {
  console.log('✅ Sync services use the SSOT and all localStorage stores merge safely on sync')
  process.exit(0)
}
