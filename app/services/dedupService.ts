/**
 * Deduplication Service
 * Finds and removes duplicate entries across all IndexedDB stores.
 *
 * Each table defines its own "duplicate key" — the combination of fields
 * that make two rows logically the same (ignoring auto-increment id).
 */

import { db } from '@/app/db/financeDB'

export interface DuplicateGroup {
  table: string
  tableLabel: string
  key: string
  ids: number[]
  keepId: number
  removeIds: number[]
  sample: Record<string, unknown>
}

export interface DedupReport {
  groups: DuplicateGroup[]
  totalDuplicates: number
}

// Define the natural key for each table (fields that identify a unique row)
const TABLE_KEYS: Record<string, { label: string; keyFn: (row: any) => string }> = {
  transactions: {
    label: 'עסקאות',
    keyFn: (r) => `${r.type}|${r.date}|${r.amount}|${r.description}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}|${r.month}|${r.fileId}`,
  },
  importedFiles: {
    label: 'קבצים מיובאים',
    keyFn: (r) => `${r.fileName}|${r.fileType}|${r.processingMonth}|${r.accountNumber ?? ''}|${r.cardNumber ?? ''}`,
  },
  categories: {
    label: 'קטגוריות',
    keyFn: (r) => `${r.name}|${r.type}`,
  },
  businessCategories: {
    label: 'שיוך עסקים',
    keyFn: (r) => r.business,
  },
  tasks: {
    label: 'משימות',
    keyFn: (r) => `${r.title}|${r.createdAt}`,
  },
  appSettings: {
    label: 'הגדרות',
    keyFn: (r) => r.key,
  },
  businesses: {
    label: 'עסקים',
    keyFn: (r) => r.name,
  },
  projects: {
    label: 'פרויקטים',
    keyFn: (r) => `${r.businessId}|${r.name}`,
  },
  harvestTasks: {
    label: 'משימות זמן',
    keyFn: (r) => `${r.projectId}|${r.name}`,
  },
  timeEntries: {
    label: 'רישומי זמן',
    keyFn: (r) => `${r.taskId}|${r.date}|${r.startTime}|${r.endTime}|${r.hours}`,
  },
  capitalEntries: {
    label: 'נכסי הון',
    keyFn: (r) => `${r.date}|${r.institution}|${r.accountNumber}|${r.description}|${r.assetType}|${r.fileId ?? ''}`,
  },
  financialInstitutions: {
    label: 'מוסדות פיננסיים',
    keyFn: (r) => `${r.name}|${r.type}`,
  },
  ypayDocuments: {
    label: 'מסמכי YPAY',
    keyFn: (r) => r.transactionId,
  },
  taxDocuments: {
    label: 'מסמכי מס',
    keyFn: (r) => `${r.businessId}|${r.month}|${r.fileName}`,
  },
}

/**
 * Scan all tables and return groups of duplicate rows.
 * For each group, the row with the lowest id is kept (oldest).
 */
export async function findDuplicates(): Promise<DedupReport> {
  const groups: DuplicateGroup[] = []

  for (const [tableName, { label, keyFn }] of Object.entries(TABLE_KEYS)) {
    const table = (db as any)[tableName]
    if (!table) continue

    const rows = await table.toArray()
    const byKey = new Map<string, any[]>()

    for (const row of rows) {
      const key = keyFn(row)
      const existing = byKey.get(key)
      if (existing) {
        existing.push(row)
      } else {
        byKey.set(key, [row])
      }
    }

    for (const [key, dupes] of byKey) {
      if (dupes.length <= 1) continue

      // Keep the one with the lowest id (first inserted)
      dupes.sort((a: any, b: any) => a.id - b.id)
      const keepId = dupes[0].id
      const removeIds = dupes.slice(1).map((r: any) => r.id)

      // Build a readable sample (exclude id)
      const { id, ...sample } = dupes[0]

      groups.push({
        table: tableName,
        tableLabel: label,
        key,
        ids: dupes.map((r: any) => r.id),
        keepId,
        removeIds,
        sample,
      })
    }
  }

  const totalDuplicates = groups.reduce((sum, g) => sum + g.removeIds.length, 0)
  return { groups, totalDuplicates }
}

/**
 * Remove duplicate rows for a specific table.
 * Deletes all ids in removeIds.
 */
async function bulkDeleteFromTable(tableName: string, removeIds: number[]): Promise<number> {
  const table = (db as any)[tableName]
  if (!table) return 0
  await table.bulkDelete(removeIds)
  return removeIds.length
}

/**
 * Remove duplicates for a single table, with FK remapping.
 */
export async function removeDuplicatesForTable(tableName: string, removeIds: number[], report?: DedupReport): Promise<number> {
  if (report) {
    await remapOrphanedForeignKeys(report)
  }
  return bulkDeleteFromTable(tableName, removeIds)
}

/**
 * Build a map of removedId → keptId for a table from the dedup report.
 */
function buildIdRemap(report: DedupReport, table: string): Map<number, number> {
  const remap = new Map<number, number>()
  for (const group of report.groups) {
    if (group.table !== table) continue
    for (const removedId of group.removeIds) {
      remap.set(removedId, group.keepId)
    }
  }
  return remap
}

/**
 * Remap orphaned foreign keys in child tables after parent duplicates are removed.
 * Chain: businesses → projects.businessId → harvestTasks.projectId → timeEntries.taskId
 */
async function remapOrphanedForeignKeys(report: DedupReport): Promise<void> {
  // 1. Remap projects.businessId for removed businesses
  const bizRemap = buildIdRemap(report, 'businesses')
  if (bizRemap.size > 0) {
    const projects = await db.projects.toArray()
    for (const p of projects) {
      const newId = bizRemap.get(p.businessId)
      if (newId !== undefined) {
        await db.projects.update(p.id!, { businessId: newId })
      }
    }
  }

  // 2. Remap harvestTasks.projectId for removed projects
  const projRemap = buildIdRemap(report, 'projects')
  if (projRemap.size > 0) {
    const tasks = await db.harvestTasks.toArray()
    for (const t of tasks) {
      const newId = projRemap.get(t.projectId)
      if (newId !== undefined) {
        await db.harvestTasks.update(t.id!, { projectId: newId })
      }
    }
  }

  // 3. Remap timeEntries.taskId for removed harvestTasks
  const taskRemap = buildIdRemap(report, 'harvestTasks')
  if (taskRemap.size > 0) {
    const entries = await db.timeEntries.toArray()
    for (const e of entries) {
      const newId = taskRemap.get(e.taskId)
      if (newId !== undefined) {
        await db.timeEntries.update(e.id!, { taskId: newId })
      }
    }
  }

  // 4. Remap transactions.fileId for removed importedFiles
  const fileRemap = buildIdRemap(report, 'importedFiles')
  if (fileRemap.size > 0) {
    const txns = await db.transactions.toArray()
    for (const t of txns) {
      const newId = fileRemap.get(Number(t.fileId))
      if (newId !== undefined) {
        await db.transactions.update(t.id!, { fileId: String(newId) })
      }
    }
  }
}

/**
 * Remove all duplicates across all tables.
 * Remaps foreign keys BEFORE deleting, so no orphans are created.
 */
export async function removeAllDuplicates(report: DedupReport): Promise<number> {
  // Remap foreign keys first, while both old and new ids still exist
  await remapOrphanedForeignKeys(report)

  let total = 0
  const byTable = new Map<string, number[]>()
  for (const group of report.groups) {
    const existing = byTable.get(group.table) ?? []
    existing.push(...group.removeIds)
    byTable.set(group.table, existing)
  }

  for (const [tableName, ids] of byTable) {
    total += await removeDuplicatesForTable(tableName, ids)
  }

  return total
}
