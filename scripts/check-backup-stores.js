#!/usr/bin/env node

/**
 * Check that backupService.ts includes all stores from the registry
 * Run: node scripts/check-backup-stores.js
 */

const fs = require('fs')
const path = require('path')

const BACKUP_SERVICE_PATH = path.join(__dirname, '../app/services/backupService.ts')
const backupServiceContent = fs.readFileSync(BACKUP_SERVICE_PATH, 'utf-8')

// Must match app/stores/registry.ts
const INDEXEDDB_TABLES = [
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
  'ypayDocuments',
]

const LOCALSTORAGE_STORES = [
  'subjectStore',
  'timerStore',
]

let hasErrors = false

console.log('Checking backupService.ts includes all registered stores...\n')

// Check IndexedDB tables
console.log('IndexedDB tables:')
for (const table of INDEXEDDB_TABLES) {
  const hasExport = backupServiceContent.includes(`db.${table}.toArray()`)
  const hasClear = backupServiceContent.includes(`db.${table}.clear()`)
  const hasImport = backupServiceContent.includes(`db.${table}.bulkAdd`)

  if (hasExport && hasClear && hasImport) {
    console.log(`  ✅ ${table}`)
  } else {
    const missing = [
      !hasExport && 'export',
      !hasClear && 'clear',
      !hasImport && 'import'
    ].filter(Boolean).join(', ')
    console.log(`  ❌ ${table} - missing: ${missing}`)
    hasErrors = true
  }
}

// Check localStorage stores
console.log('\nlocalStorage stores:')
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

console.log('')

if (hasErrors) {
  console.error('❌ backupService.ts is missing some stores!')
  console.error('   Update backupService.ts to include all stores from app/stores/registry.ts')
  process.exit(1)
} else {
  console.log('✅ All stores are included in backupService.ts')
  process.exit(0)
}
