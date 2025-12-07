import { db, BusinessCategory } from './financeDB'

const MIGRATION_KEY = 'finance-business-migration-completed'
const TRANSACTIONS_KEY = 'finance-transactions'

/**
 * Migrate business-category mappings from localStorage transactions to IndexedDB
 */
export async function migrateBusinessCategories(): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if migration already completed
    // eslint-disable-next-line no-restricted-syntax
    const migrationCompleted = localStorage.getItem(MIGRATION_KEY)
    if (migrationCompleted === 'true') {
      console.log('✅ Business-category migration already completed')
      return { success: true }
    }

    console.log('🔄 Starting business-category migration...')

    // Read old localStorage transactions
    // eslint-disable-next-line no-restricted-syntax
    const stored = localStorage.getItem(TRANSACTIONS_KEY)
    if (!stored) {
      // eslint-disable-next-line no-restricted-syntax
      localStorage.setItem(MIGRATION_KEY, 'true')
      return { success: true }
    }

    const data = JSON.parse(stored)
    const businessCategoryMap = new Map<string, string>()

    // Extract bank transactions (description → category)
    const bankTransactions = data.transactions || []
    bankTransactions.forEach((t: any) => {
      if (t.category && t.category.trim() !== '' && t.description) {
        const business = t.description.trim()
        if (!businessCategoryMap.has(business)) {
          businessCategoryMap.set(business, t.category)
        }
      }
    })

    // Extract credit card transactions (merchant → category)
    const creditCardData = data.creditCardData || {}
    for (const cardNumber in creditCardData) {
      const cardMonths = creditCardData[cardNumber]
      for (const month in cardMonths) {
        const payments = cardMonths[month] || []
        payments.forEach((p: any) => {
          if (p.category && p.category.trim() !== '' && p.merchant) {
            const business = p.merchant.trim()
            if (!businessCategoryMap.has(business)) {
              businessCategoryMap.set(business, p.category)
            }
          }
        })
      }
    }

    console.log(`Found ${businessCategoryMap.size} business-category mappings`)

    // Save to IndexedDB
    const businessCategories: BusinessCategory[] = Array.from(businessCategoryMap.entries()).map(
      ([business, category]) => ({
        business,
        category,
        lastUpdated: new Date().toISOString(),
      })
    )

    await db.businessCategories.bulkAdd(businessCategories)
    console.log(`✅ Migrated ${businessCategories.length} business-category mappings`)

    // Mark migration as completed
    // eslint-disable-next-line no-restricted-syntax
    localStorage.setItem(MIGRATION_KEY, 'true')

    return { success: true }
  } catch (error) {
    console.error('❌ Business-category migration failed:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Reset migration flag (for testing purposes)
 */
export function resetBusinessMigration() {
  // eslint-disable-next-line no-restricted-syntax
  localStorage.removeItem(MIGRATION_KEY)
  console.log('Business-category migration flag reset')
}
