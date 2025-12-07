import { db, Transaction, ImportedFile, Category } from './financeDB'

const LOCALSTORAGE_KEYS = {
  TRANSACTIONS: 'finance-transactions',
  IMPORTED_FILES: 'finance-imported-files',
  CATEGORIES: 'finance-categories',
  MIGRATION_COMPLETED: 'finance-migration-completed',
}

/**
 * Migrate data from localStorage to IndexedDB
 * This should be called once on app initialization
 */
export async function migrateFromLocalStorage(): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if migration already completed
    const migrationCompleted = localStorage.getItem(LOCALSTORAGE_KEYS.MIGRATION_COMPLETED)
    if (migrationCompleted === 'true') {
      console.log('✅ Migration already completed')
      return { success: true }
    }

    console.log('🔄 Starting migration from localStorage to IndexedDB...')
    console.log('✅ Main migration skipped (no transaction migration needed)')
    return { success: true }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    return { success: false, error: String(error) }
  }
}

async function migrateBankTransactions() {
  const stored = localStorage.getItem(LOCALSTORAGE_KEYS.TRANSACTIONS)
  if (!stored) {
    console.log('No bank transactions to migrate')
    return
  }

  const data = JSON.parse(stored)
  const bankTransactions = data.transactions || []

  console.log(`Migrating ${bankTransactions.length} bank transactions...`)

  const transactionsToInsert: Transaction[] = bankTransactions.map((t: any) => ({
    type: 'bank' as const,
    date: t.date,
    amount: t.amount,
    description: t.description,
    category: t.category,
    isFixed: t.isFixed || false,
    accountNumber: t.accountNumber,
    balance: t.balance,
    isCreditCardCharge: t.isCreditCardCharge || false,
    processingMonth: t.date.substring(3), // Extract MM/YYYY from DD/MM/YYYY
    importedAt: data.lastUpdated || new Date().toISOString(),
    fileId: `bank-${t.date.substring(3)}`, // Create a pseudo file ID
  }))

  await db.transactions.bulkAdd(transactionsToInsert)
  console.log(`✅ Migrated ${transactionsToInsert.length} bank transactions`)
}

async function migrateCreditCardTransactions() {
  const stored = localStorage.getItem(LOCALSTORAGE_KEYS.TRANSACTIONS)
  if (!stored) return

  const data = JSON.parse(stored)
  const creditCardData = data.creditCardData || {}

  let totalCount = 0

  // creditCardData structure: { cardNumber: { chargingMonth: [payments] } }
  for (const [cardNumber, cardMonths] of Object.entries(creditCardData)) {
    for (const [chargingMonth, payments] of Object.entries(cardMonths as any)) {
      const paymentsArray = payments as any[]

      const transactionsToInsert: Transaction[] = paymentsArray.map((p: any) => ({
        type: 'credit' as const,
        date: p.transactionDate,
        amount: -Math.abs(p.amount), // Ensure negative for expenses
        description: p.merchant || '',
        merchant: p.merchant,
        category: p.category,
        isFixed: p.isFixed || false,
        cardNumber: cardNumber,
        chargingDate: p.chargingDate,
        currentStep: p.currentStep,
        totalSteps: p.totalSteps,
        totalAmount: p.totalAmount,
        processingMonth: chargingMonth,
        importedAt: data.lastUpdated || new Date().toISOString(),
        fileId: `credit-${cardNumber}-${chargingMonth}`,
      }))

      await db.transactions.bulkAdd(transactionsToInsert)
      totalCount += transactionsToInsert.length
    }
  }

  console.log(`✅ Migrated ${totalCount} credit card transactions`)
}

async function migrateImportedFiles() {
  const stored = localStorage.getItem(LOCALSTORAGE_KEYS.IMPORTED_FILES)
  if (!stored) {
    console.log('No imported files to migrate')
    return
  }

  const data = JSON.parse(stored)
  const files = data.files || []

  console.log(`Migrating ${files.length} imported files...`)

  const filesToInsert: ImportedFile[] = files.map((f: any) => {
    if (!f.importDate) {
      throw new Error(`Missing importDate field in file: ${JSON.stringify(f)}`)
    }
    return {
      fileName: f.fileName,
      fileType: f.fileType,
      processingMonth: f.processingMonth,
      accountNumber: f.accountNumber,
      cardNumber: f.cardNumber,
      transactionCount: f.transactionCount,
      importedAt: f.importDate,
    }
  })

  await db.importedFiles.clear()
  await db.importedFiles.bulkAdd(filesToInsert)
  console.log(`✅ Migrated ${filesToInsert.length} imported files`)
}

async function migrateCategories() {
  const stored = localStorage.getItem(LOCALSTORAGE_KEYS.CATEGORIES)
  if (!stored) {
    console.log('No categories to migrate')
    return
  }

  const data = JSON.parse(stored)
  const categories = data.categories || []

  console.log(`Migrating ${categories.length} categories...`)

  const categoriesToInsert: Category[] = categories.map((c: any) => ({
    name: c.name,
    type: c.type,
    icon: c.icon,
    color: c.color,
  }))

  await db.categories.bulkAdd(categoriesToInsert)
  console.log(`✅ Migrated ${categoriesToInsert.length} categories`)
}

/**
 * Reset migration flag (for testing purposes)
 */
export function resetMigration() {
  localStorage.removeItem(LOCALSTORAGE_KEYS.MIGRATION_COMPLETED)
  console.log('Migration flag reset')
}
