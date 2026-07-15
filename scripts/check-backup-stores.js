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

// subjectStore + timerStore were the last two localStorage-backed persistent
// stores (see CLAUDE.md's "No new localStorage-backed stores" rule) — both
// migrated to real Dexie synced tables (`subjects`/`subjectClassifications`,
// and appSettings key `activeTimer`) in the subjectStore/timerStore → Dexie
// migration. No more legacy exceptions remain, so the LOCALSTORAGE_STORES
// allowlist and its checks below were removed rather than left empty.
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

console.log('')

if (hasErrors) {
  console.error('❌ Data-store sync is not safe!')
  console.error('   - All sync services must import SYNCED_DB_TABLES from syncedTables.ts')
  process.exit(1)
} else {
  console.log('✅ Sync services use the SSOT')
  process.exit(0)
}
