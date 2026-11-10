/**
 * ESLint rule: no-inline-table-lists
 *
 * Prevents defining inline arrays of DB table names outside of syncedTables.ts.
 * If an array literal contains 3+ known synced table names, it's flagged.
 * This guards against the bug where a new table is added to one list but not others.
 */

// Read from the source of truth so this list can't go stale (it had: 16 of 24 names,
// aglamazo#472).
const fs = require('fs')
const path = require('path')
const namesSrc = fs.readFileSync(path.join(__dirname, '../app/services/syncedTableNames.ts'), 'utf-8')
const KNOWN_TABLE_NAMES = new Set([...namesSrc.matchAll(/^\s*'(\w+)',/gm)].map((m) => m[1]))
if (KNOWN_TABLE_NAMES.size < 10) throw new Error('no-inline-table-lists: could not read table names from syncedTableNames.ts')

const THRESHOLD = 3 // flag arrays with 3+ known table names

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow inline arrays of synced DB table names — use SYNCED_DB_TABLES from syncedTables.ts instead',
    },
    messages: {
      noInlineTableList:
        'Do not define inline arrays of synced table names. Import SYNCED_DB_TABLES from "@/app/services/syncedTables" instead. See syncedTables.ts for the single source of truth.',
    },
    schema: [],
  },
  create(context) {
    // Skip the source-of-truth file itself
    const filename = context.getFilename()
    if (filename.endsWith('syncedTables.ts') || filename.endsWith('syncedTableNames.ts')) return {}

    return {
      ArrayExpression(node) {
        const tableNameCount = node.elements.filter(
          (el) => el && el.type === 'Literal' && typeof el.value === 'string' && KNOWN_TABLE_NAMES.has(el.value)
        ).length

        if (tableNameCount >= THRESHOLD) {
          context.report({ node, messageId: 'noInlineTableList' })
        }
      },
    }
  },
}
