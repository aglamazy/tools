'use client'

import { useEffect, useState } from 'react'
import { migrateFromLocalStorage } from '@/app/db/migration'
import { migrateBusinessCategories } from '@/app/db/businessCategoryMigration'

export default function MigrationRunner() {
  const [migrationStatus, setMigrationStatus] = useState<'pending' | 'running' | 'success' | 'error'>('pending')

  useEffect(() => {
    const runMigrations = async () => {
      setMigrationStatus('running')

      // Run main transaction migration (currently disabled - just clears DB)
      const mainResult = await migrateFromLocalStorage()
      if (!mainResult.success) {
        setMigrationStatus('error')
        console.error('Main migration error:', mainResult.error)
        return
      }

      // Run business-category migration
      const businessResult = await migrateBusinessCategories()
      if (!businessResult.success) {
        setMigrationStatus('error')
        console.error('Business-category migration error:', businessResult.error)
        return
      }

      setMigrationStatus('success')
    }

    runMigrations()
  }, [])

  // Don't show anything - migration runs silently in background
  return null
}
