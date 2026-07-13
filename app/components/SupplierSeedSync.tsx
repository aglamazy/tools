'use client'

/**
 * Best-effort, idempotent Supplier catalog seed — runs once per authenticated
 * session on real app load. No UI. Must never block rendering or throw up to
 * the user; a failed seed just means the supplier catalog stays thinner than
 * it could be until the next successful run.
 */

import { useEffect } from 'react'
import { subscribeToAuth } from '@/app/stores/authStore'
import { seedSuppliersFromTransactions } from '@/app/services/supplierMigration'

export default function SupplierSeedSync() {
  useEffect(() => {
    let seeded = false
    const unsubscribe = subscribeToAuth(({ user, initialized }) => {
      if (!initialized || !user || seeded) return
      seeded = true
      seedSuppliersFromTransactions().catch((err) => console.error('[supplierMigration] seed failed:', err))
    })
    return unsubscribe
  }, [])

  return null
}
