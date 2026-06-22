'use client'

import { useEffect } from 'react'
import { migratePartnerPaidBusinessId } from '@/app/services/migrations/migratePartnerPaidBusinessId'
import { db } from '@/app/db/financeDB'

/**
 * Exposes one-shot data-repair migrations on `window.aglamazoMigrations` so
 * Agla can run them from DevTools on prod aglamazo.com without shipping a
 * visible UI button. Mounted from the dashboard layout, so it's available on
 * every authed page.
 *
 * Usage:
 *   // Inspect data
 *   console.table(await window.aglamazoMigrations.dumpBusinesses())
 *   console.table(await window.aglamazoMigrations.dumpCategories())
 *   // Repair partner-paid drift
 *   await window.aglamazoMigrations.partnerPaidBusinessId({ dryRun: true })
 *   await window.aglamazoMigrations.partnerPaidBusinessId({
 *     dryRun: false,
 *     vendorRules: [{ vendorPattern: /^Meta/i, toBusinessId: <AH_ID> }],
 *   })
 */
export default function MigrationsRegistry() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as any).aglamazoMigrations = {
      partnerPaidBusinessId: migratePartnerPaidBusinessId,
      dumpBusinesses: async () => {
        const rows = await db.businesses.toArray()
        return rows.map((b: any) => ({
          id: b.id,
          name: b.name,
          syncId: b.syncId,
          vatType: b.vatType,
        }))
      },
      dumpCategories: async (opts?: { type?: 'income' | 'expense' }) => {
        const rows = await db.categories.toArray()
        const filtered = opts?.type ? rows.filter((c: any) => c.type === opts.type) : rows
        return filtered.map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          businessId: c.businessId,
          syncId: c.syncId,
        }))
      },
    }
  }, [])
  return null
}
