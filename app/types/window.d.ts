import type { Business } from '@/app/db/financeDB'
import type { PartnerPaidMigrationReport, VendorRule } from '@/app/services/migrations/migratePartnerPaidBusinessId'

declare global {
  interface Window {
    aglamazoMigrations?: {
      partnerPaidBusinessId: (opts?: { dryRun?: boolean; vendorRules?: VendorRule[] }) => Promise<PartnerPaidMigrationReport>
      dumpBusinesses: () => Promise<Array<{
        id: number | undefined
        name: string
        syncId: string | undefined
        vatType: Business['vatType']
      }>>
      dumpCategories: (opts?: { type?: 'income' | 'expense' }) => Promise<Array<{
        id: number | undefined
        name: string
        type: 'income' | 'expense'
        businessId: number | undefined
        syncId: string | undefined
      }>>
    }
  }
}

export {}
