/**
 * Purge Service
 * Permanently removes soft-deleted records older than 30 days.
 * Should be called after each merge cycle.
 */

import { db, withRawAccess } from '@/app/db/financeDB'

const PURGE_THRESHOLD_DAYS = 30

/**
 * Purge all soft-deleted records older than 30 days from all tables.
 */
export async function purgeOldDeletedRecords(): Promise<void> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PURGE_THRESHOLD_DAYS)
  const cutoffISO = cutoff.toISOString()

  await withRawAccess(async () => {
    // All tables that participate in soft-delete
    const tables = [
      db.transactions,
      db.importedFiles,
      db.categories,
      db.businessCategories,
      db.tasks,
      db.appSettings,
      db.businesses,
      db.projects,
      db.harvestTasks,
      db.timeEntries,
      db.capitalEntries,
      db.financialInstitutions,
      db.ypayDocuments,
      db.vacations,
    ]

    let totalPurged = 0

    for (const table of tables) {
      const all = await table.toArray()
      const toPurge = all
        .filter((r: any) => r.deletedAt && r.deletedAt < cutoffISO)
        .map((r: any) => r.id)
        .filter((id: any) => id != null)

      if (toPurge.length > 0) {
        await table.bulkDelete(toPurge)
        totalPurged += toPurge.length
      }
    }

    if (totalPurged > 0) {
      console.log(`[Purge] Removed ${totalPurged} records deleted more than ${PURGE_THRESHOLD_DAYS} days ago`)
    }
  })
}
