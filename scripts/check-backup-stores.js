#!/usr/bin/env node

/**
 * Validate that backupService.ts covers ALL data stores.
 *
 * Tables are auto-discovered from financeDB.ts (the Dexie schema)
 * and localStorage stores from registry.ts.
 * This way, adding a new table to the DB without updating backup
 * will fail the pre-commit hook automatically.
 *
 * Run: node scripts/check-backup-stores.js
 */

const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, '../app/db/financeDB.ts')
const REGISTRY_PATH = path.join(__dirname, '../app/stores/registry.ts')
const BACKUP_SERVICE_PATH = path.join(__dirname, '../app/services/backupService.ts')

const dbContent = fs.readFileSync(DB_PATH, 'utf-8')
const registryContent = fs.readFileSync(REGISTRY_PATH, 'utf-8')
const backupContent = fs.readFileSync(BACKUP_SERVICE_PATH, 'utf-8')

let hasErrors = false

// --- Auto-discover IndexedDB tables from financeDB.ts ---
// Match lines like: tableName!: Table<Type, number>
const tableRegex = /^\s+(\w+)!:\s*Table</gm
const dbTables = []
let match
while ((match = tableRegex.exec(dbContent)) !== null) {
  dbTables.push(match[1])
}

if (dbTables.length === 0) {
  console.error('❌ Could not parse any tables from financeDB.ts')
  process.exit(1)
}

// --- Parse localStorage stores from registry.ts ---
const lsSection = registryContent.match(/LOCALSTORAGE_STORES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)
const lsStores = []
if (lsSection) {
  const storeMatches = lsSection[1].matchAll(/['"](\w+)['"]/g)
  for (const m of storeMatches) {
    lsStores.push(m[1])
  }
}

// --- Parse IndexedDB tables from registry.ts ---
const regSection = registryContent.match(/INDEXEDDB_TABLES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)
const registryTables = []
if (regSection) {
  const tableMatches = regSection[1].matchAll(/['"](\w+)['"]/g)
  for (const m of tableMatches) {
    registryTables.push(m[1])
  }
}

console.log('Checking backup coverage for all data stores...\n')

// --- Step 1: Check registry.ts matches financeDB.ts ---
console.log(`IndexedDB tables (discovered ${dbTables.length} from financeDB.ts):`)

const missingFromRegistry = dbTables.filter(t => !registryTables.includes(t))
const extraInRegistry = registryTables.filter(t => !dbTables.includes(t))

if (missingFromRegistry.length > 0) {
  for (const table of missingFromRegistry) {
    console.log(`  ❌ ${table} - in financeDB.ts but MISSING from registry.ts`)
    hasErrors = true
  }
}
if (extraInRegistry.length > 0) {
  for (const table of extraInRegistry) {
    console.log(`  ❌ ${table} - in registry.ts but NOT in financeDB.ts`)
    hasErrors = true
  }
}

// --- Step 2: Check backupService.ts covers all DB tables ---
for (const table of dbTables) {
  const hasExport = backupContent.includes(`db.${table}.toArray()`)
  const hasClear = backupContent.includes(`db.${table}.clear()`)
  const hasImport = backupContent.includes(`db.${table}.bulkAdd`)

  if (hasExport && hasClear && hasImport) {
    console.log(`  ✅ ${table}`)
  } else {
    const missing = [
      !hasExport && 'export',
      !hasClear && 'clear',
      !hasImport && 'import'
    ].filter(Boolean).join(', ')
    console.log(`  ❌ ${table} - missing from backupService.ts: ${missing}`)
    hasErrors = true
  }
}

// --- Step 3: Check localStorage stores ---
console.log(`\nlocalStorage stores (${lsStores.length} from registry.ts):`)
for (const store of lsStores) {
  const hasExport = backupContent.includes(`${store}.export()`)
  const hasImport = backupContent.includes(`${store}.import(`)

  if (hasExport && hasImport) {
    console.log(`  ✅ ${store}`)
  } else {
    const missing = [
      !hasExport && 'export',
      !hasImport && 'import'
    ].filter(Boolean).join(', ')
    console.log(`  ❌ ${store} - missing from backupService.ts: ${missing}`)
    hasErrors = true
  }
}

console.log('')

if (hasErrors) {
  console.error('❌ Backup coverage is incomplete!')
  console.error('   When adding a new DB table: update financeDB.ts, registry.ts, AND backupService.ts')
  process.exit(1)
} else {
  console.log('✅ All stores are covered by backup/restore')
  process.exit(0)
}
