// Transaction Store - Uses IndexedDB via Dexie
// Replaces localStorage-based store with normalized database

import { db, Transaction, ImportedFile } from '@/app/db/financeDB'
import { addMonths } from '@/app/utils/formatters'

export const transactionStore = {
  /**
   * Get all data or filtered data
   * @param fileType - Optional: 'bank' or 'credit'
   * @param month - Optional: MM/YYYY format - filters by transaction month
   * @param cardNumber - Optional: for credit card filtering
   */
  getData: async (fileType?: string, month?: string, cardNumber?: string): Promise<Transaction[] | null> => {
    try {
      // No filters - return all transactions
      if (!fileType && !month) {
        return await db.transactions.toArray()
      }

      // Build query
      let query = db.transactions.toCollection()

      if (fileType) {
        query = db.transactions.where('type').equals(fileType === 'bank' ? 'bank' : 'credit')
      }

      if (month) {
        query = query.and((t) => t.month === month)
      }

      if (cardNumber) {
        query = query.and((t) => t.cardNumber === cardNumber)
      }

      return await query.toArray()
    } catch (error) {
      console.error('Error getting data:', error)
      return null
    }
  },

  /**
   * Get list of available months that have transactions (sorted newest first)
   */
  getAvailableMonths: async (): Promise<string[]> => {
    try {
      // Only use months from bank transactions so the selector reflects loaded bank statements
      const bankTransactions = await db.transactions
        .where('type')
        .equals('bank')
        .toArray()

      const months = Array.from(new Set(bankTransactions.map((t) => t.month)))

      // Sort newest first (MM/YYYY format)
      return months.sort((a, b) => {
        const [aMonth, aYear] = a.split('/').map(Number)
        const [bMonth, bYear] = b.split('/').map(Number)
        return bYear * 12 + bMonth - (aYear * 12 + aMonth)
      })
    } catch (error) {
      console.error('Error getting available months:', error)
      return []
    }
  },

  /**
   * Get imported files list
   */
  getImportedFiles: async (): Promise<{ files: ImportedFile[]; lastUpdated: string } | null> => {
    try {
      // Build file list directly from transactions (single source of truth)
      const txns = await db.transactions.toArray()
      const byFile = new Map<string, ImportedFile>()
      txns.forEach((t) => {
        const inferredMonth = t.chargingDate ? t.chargingDate.substring(3) : t.month || ''
        const key = t.fileId || `${t.type}-${inferredMonth || 'unknown'}-${t.cardNumber || t.accountNumber || 'n/a'}`
        const existing = byFile.get(key)
        if (existing) {
          existing.transactionCount += 1
        } else {
          byFile.set(key, {
            fileName: key,
            fileKey: key,
            fileType: t.type === 'credit' ? 'credit-card' : 'bank',
            processingMonth: inferredMonth,
            accountNumber: t.accountNumber,
            cardNumber: t.cardNumber,
            transactionCount: 1,
            importedAt: t.importedAt || new Date().toISOString(),
          })
        }
      })

      const files = Array.from(byFile.values())
      const lastUpdated = files.length > 0
        ? files.reduce((latest, f) => (f.importedAt > latest ? f.importedAt : latest), files[0].importedAt)
        : new Date().toISOString()

      return { files, lastUpdated }
    } catch (error) {
      console.error('Error getting imported files:', error)
      return null
    }
  },

  /**
   * Save imported file metadata
   */
  saveImportedFile: async (file: Omit<ImportedFile, 'id'>): Promise<number | null> => {
    try {
      const id = await db.importedFiles.add({
        ...file,
        fileName: file.fileName || file.fileKey || 'unknown-file',
      })
      return id
    } catch (error) {
      console.error('Error saving imported file:', error)
      return null
    }
  },

  /**
   * Delete imported file and its transactions
   */
  deleteImportedFile: async (fileId: number): Promise<boolean> => {
    try {
      // Delete associated transactions first
      await db.transactions.where('fileId').equals(String(fileId)).delete()

      // Delete file record
      await db.importedFiles.delete(fileId)

      return true
    } catch (error) {
      console.error('Error deleting file:', error)
      return false
    }
  },

  /**
   * Get transactions by fileId/fileKey
   */
  getTransactionsByFileKey: async (fileKey: string): Promise<Transaction[]> => {
    try {
      return await db.transactions.where('fileId').equals(fileKey).toArray()
    } catch (error) {
      console.error('Error getting transactions by file key:', error)
      return []
    }
  },

  /**
   * Delete transactions for a file (by type, month, and optional card number)
   */
  deleteTransactionsForFile: async (
    fileType: string,
    month: string,
    cardNumber?: string,
    fileKey?: string,
    fileNameHint?: string
  ): Promise<boolean> => {
    try {
      if (fileKey) {
        await db.transactions.where('fileId').equals(fileKey).delete()
      }

      if (fileNameHint) {
        await db.transactions
          .filter((t) => typeof t.fileId === 'string' && t.fileId.includes(fileNameHint))
          .delete()
      }

      if (fileType === 'bank') {
        await db.transactions
          .where('[type+month]')
          .equals(['bank', month])
          .delete()
      } else if (fileType === 'credit-card' && cardNumber) {
        await db.transactions
          .where({ type: 'credit', cardNumber, month })
          .delete()
      }

      return true
    } catch (error) {
      console.error('Error deleting transactions:', error)
      return false
    }
  },

  /**
   * Save imported files list
   */
  saveImportedFiles: async (data: { files: ImportedFile[]; lastUpdated: string }): Promise<boolean> => {
    try {
      // Clear existing files and insert new ones
      await db.importedFiles.clear()
      await db.importedFiles.bulkAdd(data.files)
      return true
    } catch (error) {
      console.error('Error saving imported files:', error)
      return false
    }
  },

  /**
   * Save bank transactions for a specific month
   */
  saveBankTransactions: async (
    month: string,
    transactions: any[],
    accountNumber: string,
    fileId: string
  ): Promise<boolean> => {
    try {
      // Get existing transactions for this account
      const existingTransactions = await db.transactions
        .where('type')
        .equals('bank')
        .and((t) => t.accountNumber === accountNumber)
        .toArray()

      // Create a Set of existing transaction keys for quick lookup
      const existingKeys = new Set(
        existingTransactions.map((t) => `${t.date}|${t.description}|${t.amount}`)
      )

      // Filter out duplicates
      const newTransactions = transactions.filter((t) => {
        const key = `${t.date}|${t.description}|${t.amount}`
        return !existingKeys.has(key)
      })

      console.log(`📊 Bank import: ${transactions.length} total, ${newTransactions.length} new, ${transactions.length - newTransactions.length} duplicates skipped`)

      if (newTransactions.length === 0) {
        return true // No new transactions to insert
      }

      const transactionsToInsert: Transaction[] = newTransactions.map((t) => ({
        type: 'bank',
        date: t.date,
        amount: t.amount,
        description: t.description,
        category: t.category,
        isFixed: t.isFixed || false,
        accountNumber: accountNumber,
        balance: t.balance,
        isCreditCardCharge: t.isCreditCardCharge || false,
        month: t.date.substring(3), // Extract MM/YYYY from DD/MM/YYYY
        importedAt: new Date().toISOString(),
        fileId: fileId,
      }))

      await db.transactions.bulkAdd(transactionsToInsert)
      return true
    } catch (error) {
      console.error('Error saving bank transactions:', error)
      return false
    }
  },

  /**
   * Save credit card transactions for a specific card and month
   */
  saveCreditCardData: async (
    cardNumber: string,
    payments: any[],
    chargingDate: string,
    month: string,
    fileId: string
  ): Promise<boolean> => {
    try {
      // Get existing transactions for this card
      const existingTransactions = await db.transactions
        .where('type')
        .equals('credit')
        .and((t) => t.cardNumber === cardNumber)
        .toArray()

      // Create a Set of existing transaction keys for quick lookup
      const existingKeys = new Set(
        existingTransactions.map((t) => `${t.date}|${t.merchant}|${t.amount}|${t.currentStep}|${t.totalSteps}`)
      )

      // Filter out duplicates
      const newPayments = payments.filter((p) => {
        const key = `${p.transactionDate}|${p.merchant}|${-Math.abs(p.amount)}|${p.currentStep}|${p.totalSteps}`
        return !existingKeys.has(key)
      })

      console.log(`💳 Credit import: ${payments.length} total, ${newPayments.length} new, ${payments.length - newPayments.length} duplicates skipped`)

      if (newPayments.length === 0) {
        return true // No new transactions to insert
      }

      const transactionsToInsert: Transaction[] = newPayments.map((p) => ({
        type: 'credit',
        date: p.transactionDate,
        amount: -Math.abs(p.amount), // Ensure negative
        description: p.merchant || '',
        merchant: p.merchant,
        category: p.category,
        isFixed: p.isFixed || false,
        cardNumber: cardNumber,
        chargingDate: chargingDate,
        currentStep: p.currentStep,
        totalSteps: p.totalSteps,
        totalAmount: p.totalAmount,
        month: p.transactionDate.substring(3), // Extract MM/YYYY from DD/MM/YYYY
        importedAt: new Date().toISOString(),
        fileId: fileId,
      }))

      await db.transactions.bulkAdd(transactionsToInsert)
      return true
    } catch (error) {
      console.error('Error saving credit card data:', error)
      return false
    }
  },

  /**
   * Get cash flow data for a specific month
   */
  getCashFlowData: async (selectedMonth: string) => {
    try {
      // Get bank transactions for the month
      const bankTransactions = await db.transactions
        .where('[type+month]')
        .equals(['bank', selectedMonth])
        .toArray()

      // Calculate opening balance from previous month
      const prevMonth = addMonths(selectedMonth, -1)
      const prevMonthTransactions = await db.transactions
        .where('[type+month]')
        .equals(['bank', prevMonth])
        .toArray()

      const openingBalance =
        prevMonthTransactions.length > 0
          ? prevMonthTransactions[prevMonthTransactions.length - 1].balance || 0
          : 0

      // Get credit card charges for this month (unpaid)
      const creditCharges = await db.transactions
        .where('[type+month]')
        .equals(['credit', selectedMonth])
        .toArray()

      // Filter out paid charges (those that appear in bank transactions)
      const paidCardNumbers = new Set<string>()
      bankTransactions.forEach((t) => {
        if (t.isCreditCardCharge) {
          const match = t.description.match(/^(\d+) -/)
          if (match) paidCardNumbers.add(match[1])
        }
      })

      // Group charges by card
      const chargesByCard = new Map<string, { totalAmount: number; chargingDate: string }>()
      creditCharges.forEach((charge) => {
        const cardNum = charge.cardNumber!
        if (!paidCardNumbers.has(cardNum) && charge.chargingDate) {
          const existing = chargesByCard.get(cardNum)
          if (existing) {
            existing.totalAmount += Math.abs(charge.amount)
          } else {
            chargesByCard.set(cardNum, {
              totalAmount: Math.abs(charge.amount),
              chargingDate: charge.chargingDate,
            })
          }
        }
      })

      const creditChargesList = Array.from(chargesByCard.entries()).map(
        ([cardNumber, { totalAmount, chargingDate }]) => ({
          cardNumber,
          chargingDate,
          totalAmount,
        })
      )

      // Get expected fixed transactions
      const expectedFixed = await getExpectedFixedTransactions(selectedMonth)

      return {
        openingBalance,
        transactions: bankTransactions,
        creditCharges: creditChargesList,
        expectedFixed,
      }
    } catch (error) {
      console.error('Error getting cash flow data:', error)
      return { openingBalance: 0, transactions: [], creditCharges: [], expectedFixed: [] }
    }
  },

  /**
   * Get budget transactions for a specific month
   * For bank: filters by transaction month (from date)
   * For credit: filters by chargingDate month (when it's charged to bank account)
   */
  getBudgetTransactions: async (selectedMonth: string) => {
    try {
      // Get bank transactions - filter by transaction month
      const bankTransactions = (await db.transactions
        .where('[type+month]')
        .equals(['bank', selectedMonth])
        .toArray()).filter((t) => !t.isCreditCardCharge) // Ignore bank-side credit card payments

      // Get credit card transactions - filter by chargingDate month
      const allCreditTransactions = await db.transactions
        .where('type')
        .equals('credit')
        .toArray()

      // Filter credit transactions by chargingDate month (DD/MM/YYYY format)
      const creditTransactions = allCreditTransactions.filter((t) => {
        if (!t.chargingDate) return false
        const chargingMonth = t.chargingDate.substring(3) // Extract MM/YYYY from DD/MM/YYYY
        return chargingMonth === selectedMonth
      })

      // Combine and format
      const allTransactions = [
        ...bankTransactions.map((t) => ({
          id: String(t.id),
          date: t.date,
          business: t.description,
          category: t.category || '',
          amount: t.amount,
          isFixed: t.isFixed,
          paymentMethod: t.accountNumber || 'Bank',
          installmentInfo: '',
          totalAmount: t.amount,
        })),
        ...creditTransactions.map((t) => ({
          id: String(t.id),
          date: t.date,
          business: t.merchant || t.description,
          category: t.category || '',
          amount: t.amount,
          isFixed: t.isFixed,
          paymentMethod: `💳 ${t.cardNumber}`,
          installmentInfo: t.totalSteps && t.totalSteps > 1 ? `${t.currentStep}/${t.totalSteps}` : '',
          totalAmount: t.totalAmount || t.amount,
        })),
      ]

      // Sort by transaction date (DD/MM/YYYY format)
      allTransactions.sort((a, b) => {
        const [aDay, aMonth, aYear] = a.date.split('/').map(Number)
        const [bDay, bMonth, bYear] = b.date.split('/').map(Number)
        const aDate = new Date(aYear, aMonth - 1, aDay)
        const bDate = new Date(bYear, bMonth - 1, bDay)
        return aDate.getTime() - bDate.getTime()
      })

      return allTransactions
    } catch (error) {
      console.error('Error getting budget transactions:', error)
      return []
    }
  },

  /**
   * Update transaction (category, isFixed, etc.)
   */
  updateAny: async (id: string, updates: { category?: string; isFixed?: boolean }): Promise<boolean> => {
    try {
      await db.transactions.update(Number(id), updates)
      return true
    } catch (error) {
      console.error('Error updating transaction:', error)
      return false
    }
  },

  /**
   * Auto-classify transactions based on learned patterns
   * Uses getBudgetTransactions to get the same data as the budget page
   */
  autoClassify: async (selectedMonth: string): Promise<{ count: number; classifiedIds: string[] }> => {
    try {
      // Load business-category mappings from IndexedDB
      const businessCategories = await db.businessCategories.toArray()
      const businessMap = new Map(businessCategories.map((bc) => [bc.business, bc.category]))

      // Get transactions same way as budget page
      const allTransactions = await transactionStore.getBudgetTransactions(selectedMonth)
      const classifiedIds: string[] = []
      const unclassified = allTransactions.filter((t) => !t.category || t.category.trim() === '')

      for (const transaction of unclassified) {
        const business = transaction.business
        const suggestedCategory = businessMap.get(business)

        if (suggestedCategory) {
          await transactionStore.updateAny(transaction.id, { category: suggestedCategory })
          classifiedIds.push(transaction.id)
        }
      }

      return { count: classifiedIds.length, classifiedIds }
    } catch (error) {
      console.error('Error auto-classifying:', error)
      return { count: 0, classifiedIds: [] }
    }
  },

  /**
   * Save or update business-category mapping
   */
  saveBusinessCategory: async (business: string, category: string): Promise<boolean> => {
    try {
      const existing = await db.businessCategories.where('business').equals(business).first()
      await db.businessCategories.put({
        ...(existing?.id ? { id: existing.id } : {}),
        business,
        category,
        lastUpdated: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error saving business-category:', error)
      return false
    }
  },

  /**
   * Clear all transactions
   */
  clearAllTransactions: async (): Promise<boolean> => {
    try {
      await db.transactions.clear()
      console.log('✅ All transactions cleared')
      return true
    } catch (error) {
      console.error('Error clearing transactions:', error)
      return false
    }
  },
}

// Helper functions

async function getCreditTransactionsForBudget(selectedMonth: string) {
  // Two-statement logic implementation
  const [month, year] = selectedMonth.split('/').map(Number)
  const nextMonth = addMonths(selectedMonth, 1)

  const currentStatement = await db.transactions
    .where('[type+month]')
    .equals(['credit', selectedMonth])
    .toArray()

  const nextStatement = await db.transactions
    .where('[type+month]')
    .equals(['credit', nextMonth])
    .toArray()

  // Extract cutoff day
  let cutoffDay = 15
  if (currentStatement.length > 0 && currentStatement[0].chargingDate) {
    cutoffDay = parseInt(currentStatement[0].chargingDate.split('/')[0], 10)
  }

  const result: any[] = []

  // Add transactions from current statement
  currentStatement.forEach((t) => {
    const isInstallment = (t.totalSteps || 1) > 1
    const transactionDay = parseInt(t.date.split('/')[0], 10)

    if (isInstallment || transactionDay <= cutoffDay) {
      result.push(formatCreditTransaction(t))
    }
  })

  // Add transactions from next statement (second half)
  const lastDayOfMonth = new Date(year, month, 0).getDate()
  nextStatement.forEach((t) => {
    const isNewInstallment = t.currentStep === 1 && (t.totalSteps || 1) > 1
    const isSinglePayment = (t.totalSteps || 1) === 1
    const transactionDay = parseInt(t.date.split('/')[0], 10)

    if ((isNewInstallment || isSinglePayment) && transactionDay > cutoffDay && transactionDay <= lastDayOfMonth) {
      result.push(formatCreditTransaction(t))
    }
  })

  return result
}

function formatCreditTransaction(t: Transaction) {
  return {
    id: String(t.id),
    date: t.date,
    business: t.merchant || t.description,
    category: t.category || '',
    amount: t.amount,
    isFixed: t.isFixed,
    paymentMethod: `💳 ${t.cardNumber}`,
    installmentInfo: t.totalSteps && t.totalSteps > 1 ? `${t.currentStep}/${t.totalSteps}` : '',
    totalAmount: t.totalAmount || t.amount,
  }
}

async function getExpectedFixedTransactions(selectedMonth: string) {
  const prevMonth = addMonths(selectedMonth, -1)
  const budgetTransactions = await transactionStore.getBudgetTransactions(selectedMonth)
  const currentMonthBusinesses = new Set(budgetTransactions.map((t) => t.business))

  const prevMonthBudget = await transactionStore.getBudgetTransactions(prevMonth)
  return prevMonthBudget
    .filter((t) => t.isFixed)
    .filter((t) => !currentMonthBusinesses.has(t.business))
    .map((t) => ({
      business: t.business,
      amount: t.amount,
      category: t.category,
      date: t.date,
    }))
}
