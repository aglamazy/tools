// Transaction Store - Handles all localStorage operations for transactions

import type {
  BudgetTransaction,
  TransactionUpdate,
  Transaction,
  TransactionStorage,
  CreditCardPayment,
  CreditCardData,
} from '@/app/types/transactions'
import { addMonths } from '@/app/utils/formatters'

const STORAGE_KEY = 'finance-transactions'
const IMPORTED_FILES_KEY = 'finance-imported-files'
const CURRENT_VERSION = '1.3'

/**
 * Migrate credit card data structure from array to nested object
 * Old: creditCardData: [{cardNumber, payments: [...]}]
 * New: creditCardData: {cardNumber: {chargingMonth: [payments]}}
 */
function migrateCreditCardStructure(data: TransactionStorage): TransactionStorage {
  // If already in new format (object), return as is
  if (!Array.isArray(data.creditCardData)) {
    return data
  }

  console.log('🔄 Migrating credit card data structure to nested object format...')

  const newCreditCardData: any = {}

  // Convert from array format to nested object format
  data.creditCardData.forEach((card: any) => {
    newCreditCardData[card.cardNumber] = {}

    // Group payments by charging month
    card.payments.forEach((payment: any) => {
      const chargingMonth = payment.chargingDate
        ? payment.chargingDate.substring(3) // Extract MM/YYYY from DD/MM/YYYY
        : null

      if (chargingMonth) {
        if (!newCreditCardData[card.cardNumber][chargingMonth]) {
          newCreditCardData[card.cardNumber][chargingMonth] = []
        }
        newCreditCardData[card.cardNumber][chargingMonth].push(payment)
      } else {
        console.warn('⚠️ Payment without chargingDate:', payment.id)
      }
    })
  })

  console.log('✅ Migrated credit card data structure')

  return {
    ...data,
    creditCardData: newCreditCardData
  }
}

/**
 * Migrate old transaction IDs to new format: <account_id>-<date>-<index>
 * Old format was: <rowIndex>-<date>-<description>-<amount>
 */
function migrateTransactionIds(data: TransactionStorage): TransactionStorage {
  // Check version - if already current version, no migration needed
  if (data.version === CURRENT_VERSION) return data

  if (data.transactions.length === 0) {
    return { ...data, version: CURRENT_VERSION }
  }

  console.log(`🔄 Migrating transaction IDs from version ${data.version} to ${CURRENT_VERSION}...`)

  // Group transactions by date for generating sequential indices
  const transactionsByDateAndAccount = new Map<string, Transaction[]>()

  data.transactions.forEach((t: Transaction) => {
    // Extract account number from transaction if available
    // For old data without accountNumber, try to extract from imported files
    let accountNumber = t.accountNumber

    if (!accountNumber) {
      // Try to get from imported files based on month
      const month = t.date.substring(3) // MM/YYYY
      const filesData = transactionStore.getImportedFiles()
      if (filesData && filesData.files) {
        const bankFile = filesData.files.find(
          (f: any) => (f.fileType === 'bank' || f.fileType === 'Bank') && f.processingMonth === month
        )
        if (bankFile?.accountNumber) {
          accountNumber = bankFile.accountNumber
        } else {
          console.warn(`⚠️ No account number found for transaction in month ${month}. Transaction: ${t.description}`)
          accountNumber = 'unknown'
        }
      } else {
        console.warn('⚠️ No imported files data found during migration')
        accountNumber = 'unknown'
      }
    }

    const key = `${accountNumber}-${t.date}`

    if (!transactionsByDateAndAccount.has(key)) {
      transactionsByDateAndAccount.set(key, [])
    }
    transactionsByDateAndAccount.get(key)!.push(t)
  })

  // Regenerate IDs with sequential indices per date
  const migratedTransactions: Transaction[] = []

  transactionsByDateAndAccount.forEach((transactions, key) => {
    const [accountNumber, date] = key.split('-', 2)

    transactions.forEach((t, index) => {
      migratedTransactions.push({
        ...t,
        id: `${accountNumber}-${date}-${index + 1}`,
        accountNumber: t.accountNumber || accountNumber,
      })
    })
  })

  console.log(`✅ Migrated ${migratedTransactions.length} transaction IDs`)

  const migratedData = {
    ...data,
    version: CURRENT_VERSION,
    transactions: migratedTransactions,
  }

  // Save migrated data back to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedData))

  return migratedData
}

export const transactionStore = {
  // Get all data from storage
  getData: () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null

    let data = JSON.parse(stored)

    // Run migrations
    data = migrateCreditCardStructure(data)
    data = migrateTransactionIds(data)

    return data
  },

  // Get imported files data
  getImportedFiles: () => {
    const stored = localStorage.getItem(IMPORTED_FILES_KEY)
    return stored ? JSON.parse(stored) : null
  },

  // Save credit card transactions organized by card number and charging month
  saveCreditCardData: (cardNumber: string, payments: CreditCardPayment[], chargingDate?: string) => {
    const data = transactionStore.getData() || {
      version: CURRENT_VERSION,
      processingMonth: null,
      transactions: [],
      creditCardData: {},
      loadedFiles: [],
      lastUpdated: '',
    }

    // Ensure creditCardData is an object
    if (!data.creditCardData || typeof data.creditCardData !== 'object') {
      data.creditCardData = {}
    }

    // Initialize card if doesn't exist
    if (!data.creditCardData[cardNumber]) {
      data.creditCardData[cardNumber] = {}
    }

    // Extract charging month from chargingDate (DD/MM/YYYY -> MM/YYYY)
    // TODO: Replace with proper Date object handling (see TODO.md #26)
    const chargingMonth = chargingDate ? chargingDate.substring(3) : null

    if (chargingMonth) {
      // Replace payments for this charging month
      data.creditCardData[cardNumber][chargingMonth] = payments
    }

    data.lastUpdated = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },

  // Save bank transactions for a specific month
  saveBankTransactions: (processingMonth: string, transactions: Transaction[]) => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const data: TransactionStorage = stored
      ? JSON.parse(stored)
      : {
          version: CURRENT_VERSION,
          processingMonth: null,
          transactions: [],
          creditCardData: [],
          loadedFiles: [],
          lastUpdated: '',
        }

    // Create a set of new transaction IDs for quick lookup
    const newTransactionIds = new Set(transactions.map(t => t.id))

    // Remove transactions that will be replaced (same ID) OR from the same month
    data.transactions = data.transactions.filter((t) => {
      // Keep if different month AND not being replaced by new transaction
      return t.date.substring(3) !== processingMonth && !newTransactionIds.has(t.id)
    })

    // Add new transactions (deduplicated by ID)
    data.transactions.push(...transactions)
    data.lastUpdated = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },

  // Get bank account number for a specific month
  getBankAccountNumber: (month: string): string => {
    const filesData = transactionStore.getImportedFiles()
    if (!filesData) return 'Bank'

    const bankFile = filesData.files.find(
      (f: any) => f.fileType === 'bank' && f.processingMonth === month
    )

    return bankFile?.accountNumber || 'Bank'
  },

  // Get cash flow data for a specific month (opening balance, transactions, credit charges)
  getCashFlowData: (selectedMonth: string) => {
    const data = transactionStore.getData()
    if (!data) return { openingBalance: 0, transactions: [], creditCharges: [] }

    // Get bank transactions for the selected month
    const monthTransactions = data.transactions.filter((t: Transaction) => {
      const transactionMonth = t.date.substring(3) // Extract MM/YYYY from DD/MM/YYYY
      return transactionMonth === selectedMonth
    })

    // Calculate opening balance from previous month's closing balance
    const prevMonth = addMonths(selectedMonth, -1)
    const prevMonthTransactions = data.transactions.filter((t: Transaction) => {
      const transactionMonth = t.date.substring(3)
      return transactionMonth === prevMonth
    })

    const openingBalance = prevMonthTransactions.length > 0
      ? prevMonthTransactions[prevMonthTransactions.length - 1].balance
      : 0

    // Calculate credit card charges for the selected month
    const creditData = data.creditCardData || {}
    const paidCardNumbers = new Set<string>()

    // Identify which cards have been paid (appear in bank transactions)
    monthTransactions.forEach((t: Transaction) => {
      if (t.isCreditCardCharge) {
        const match = t.description.match(/^(\d+) -/)
        if (match) {
          paidCardNumbers.add(match[1])
        }
      }
    })

    // Build list of unpaid credit charges
    const chargesByCard = new Map<string, { totalAmount: number; chargingDate: string }>()

    Object.keys(creditData).forEach((cardNumber) => {
      const cardMonths = creditData[cardNumber]
      const payments = cardMonths[selectedMonth]

      if (payments && payments.length > 0 && !paidCardNumbers.has(cardNumber)) {
        const cardTotal = payments.reduce((sum: number, p: any) => sum + p.amount, 0)
        const paymentWithDate = payments.find((p: any) => p.chargingDate)
        const chargingDate = paymentWithDate?.chargingDate?.substring(0, 10) || selectedMonth

        chargesByCard.set(cardNumber, { totalAmount: cardTotal, chargingDate })
      }
    })

    const creditCharges = Array.from(chargesByCard.entries()).map(
      ([cardNumber, { totalAmount, chargingDate }]) => ({
        cardNumber,
        chargingDate,
        totalAmount,
      })
    )

    return {
      openingBalance,
      transactions: monthTransactions,
      creditCharges,
    }
  },

  // Load budget transactions for a specific month
  getBudgetTransactions: (selectedMonth: string): BudgetTransaction[] => {
    const data = transactionStore.getData()
    if (!data) return []

    const budgetTransactions: BudgetTransaction[] = []
    const bankAccountNumber = transactionStore.getBankAccountNumber(selectedMonth)

    // Add bank transactions for the month (by transaction date = date field)
    data.transactions.forEach((t: any) => {
      const transactionMonth = t.date.substring(3) // Extract MM/YYYY from DD/MM/YYYY
      if (transactionMonth === selectedMonth) {
        budgetTransactions.push({
          id: t.id,
          date: t.date,
          business: t.description,
          category: t.category || '',
          amount: t.amount,
          isFixed: t.isFixed || false,
          paymentMethod: bankAccountNumber,
        })
      }
    })

    // Add credit card payments - need to fetch from TWO statements per card
    const creditData = data.creditCardData || {}
    const [selectedMonthNum, selectedYear] = selectedMonth.split('/').map(Number)

    // Calculate next month for second statement
    const nextMonthNum = selectedMonthNum === 12 ? 1 : selectedMonthNum + 1
    const nextYear = selectedMonthNum === 12 ? selectedYear + 1 : selectedYear
    const nextMonth = `${String(nextMonthNum).padStart(2, '0')}/${nextYear}`

    // Iterate through cards
    Object.keys(creditData).forEach((cardNumber) => {
      const cardMonths = creditData[cardNumber]

      // Get current month and next month statements
      const currentStatementPayments = cardMonths[selectedMonth] || []
      const nextStatementPayments = cardMonths[nextMonth] || []

      // Extract cutoff day from current statement's chargingDate
      let cutoffDay = 15 // Default fallback
      if (currentStatementPayments.length > 0 && currentStatementPayments[0].chargingDate) {
        const chargingDate = currentStatementPayments[0].chargingDate // DD/MM/YYYY
        cutoffDay = parseInt(chargingDate.split('/')[0], 10)
      }

      // Helper to check if transaction date is in range
      const isInDateRange = (transactionDate: string, startDay: number, endDay: number) => {
        const [day, month, year] = transactionDate.split('/').map(Number)
        if (month !== selectedMonthNum || year !== selectedYear) return false
        return day >= startDay && day <= endDay
      }

      // 1. From current month statement (charging in selectedMonth)
      currentStatementPayments.forEach((payment: any) => {
        const isInstallment = payment.totalSteps && payment.totalSteps > 1
        const isSinglePayment = !isInstallment || payment.totalSteps === 1

        // Take ALL installments OR single payments from day 1 to cutoff day
        if (isInstallment || (isSinglePayment && isInDateRange(payment.transactionDate, 1, cutoffDay))) {
          let installmentInfo: string | undefined
          let totalAmount: number | undefined

          if (isInstallment) {
            installmentInfo = `${payment.currentStep}/${payment.totalSteps}`
            totalAmount = -payment.amount * payment.totalSteps
          }

          budgetTransactions.push({
            id: payment.id,
            date: payment.transactionDate,
            business: payment.merchant,
            category: payment.category || '',
            amount: -payment.amount,
            isFixed: payment.isFixed || false,
            paymentMethod: cardNumber,
            installmentInfo,
            totalAmount,
          })
        }
      })

      // 2. From next month statement (charging in nextMonth)
      // Only NEW installments (1/N where N>1) + single payments from cutoffDay+1 to end of month
      const lastDayOfMonth = new Date(selectedYear, selectedMonthNum, 0).getDate()

      nextStatementPayments.forEach((payment: any) => {
        const isNewInstallment = payment.currentStep === 1 && payment.totalSteps > 1
        const isSinglePayment = !payment.totalSteps || payment.totalSteps === 1
        const inSecondHalf = isInDateRange(payment.transactionDate, cutoffDay + 1, lastDayOfMonth)

        if (inSecondHalf && (isNewInstallment || isSinglePayment)) {
          let installmentInfo: string | undefined
          let totalAmount: number | undefined

          if (isNewInstallment) {
            installmentInfo = `${payment.currentStep}/${payment.totalSteps}`
            totalAmount = -payment.amount * payment.totalSteps
          }

          budgetTransactions.push({
            id: payment.id,
            date: payment.transactionDate,
            business: payment.merchant,
            category: payment.category || '',
            amount: -payment.amount,
            isFixed: payment.isFixed || false,
            paymentMethod: cardNumber,
            installmentInfo,
            totalAmount,
          })
        }
      })
    })

    // Sort by date
    budgetTransactions.sort((a, b) => {
      const [aDay, aMonth, aYear] = a.date.split('/').map(Number)
      const [bDay, bMonth, bYear] = b.date.split('/').map(Number)
      return new Date(aYear, aMonth - 1, aDay).getTime() - new Date(bYear, bMonth - 1, bDay).getTime()
    })

    return budgetTransactions
  },

  // Update a bank transaction
  updateTransaction: (transactionId: string, updates: TransactionUpdate) => {
    const data = transactionStore.getData()
    if (!data) return

    // Update in transactions array
    data.transactions = data.transactions.map((t: any) =>
      t.id === transactionId ? { ...t, ...updates } : t
    )

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },

  // Update a credit card payment
  updateCreditCardPayment: (paymentId: string, updates: TransactionUpdate) => {
    const data = transactionStore.getData()
    if (!data) return

    const creditData = data.creditCardData || {}

    // Find and update the payment across all cards and months
    Object.keys(creditData).forEach((cardNumber) => {
      const cardMonths = creditData[cardNumber]
      Object.keys(cardMonths).forEach((month) => {
        cardMonths[month] = cardMonths[month].map((p: any) =>
          p.id === paymentId ? { ...p, ...updates } : p
        )
      })
    })

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },

  // Update any transaction (bank or credit card)
  updateAny: (transactionId: string, updates: TransactionUpdate) => {
    const data = transactionStore.getData()
    if (!data) return

    // Try to update in transactions array
    let found = false
    data.transactions = data.transactions.map((t: any) => {
      if (t.id === transactionId) {
        found = true
        return { ...t, ...updates }
      }
      return t
    })

    // If not found in transactions, try credit card payments
    if (!found) {
      const creditData = data.creditCardData || {}
      Object.keys(creditData).forEach((cardNumber) => {
        const cardMonths = creditData[cardNumber]
        Object.keys(cardMonths).forEach((month) => {
          cardMonths[month] = cardMonths[month].map((p: any) =>
            p.id === transactionId ? { ...p, ...updates } : p
          )
        })
      })
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },

  // Get relevant months for learning (current, next, previous months, and a year ago)
  getRelevantMonths: (selectedMonth: string): string[] => {
    return [
      selectedMonth,                    // Current month
      addMonths(selectedMonth, 1),      // Next month (for credit card charging month)
      addMonths(selectedMonth, -1),     // Previous month
      addMonths(selectedMonth, -2),     // Two months ago
      addMonths(selectedMonth, -12),    // Same month a year ago
    ]
  },

  // Get business-to-category map from relevant months only
  getBusinessCategoryMap: (selectedMonth: string): Map<string, string> => {
    const data = transactionStore.getData()
    if (!data) return new Map()

    const relevantMonths = transactionStore.getRelevantMonths(selectedMonth)
    const businessToCategories = new Map<string, Map<string, number>>()

    // Process bank transactions from relevant months
    data.transactions.forEach((t: any) => {
      if (!t.category || t.category.trim() === '') return

      const transactionMonth = t.date.substring(3)
      if (!relevantMonths.includes(transactionMonth)) return

      const business = t.description

      if (!businessToCategories.has(business)) {
        businessToCategories.set(business, new Map())
      }

      const categoryCounts = businessToCategories.get(business)!
      const currentCount = categoryCounts.get(t.category) || 0
      categoryCounts.set(t.category, currentCount + 1)
    })

    // Process credit card payments from relevant months
    const creditData = data.creditCardData || {}
    Object.keys(creditData).forEach((cardNumber) => {
      console.log("handling card number", cardNumber)
      const cardMonths = creditData[cardNumber]

      relevantMonths.forEach((month) => {
        const payments = cardMonths[month]
        if (!payments) return

        payments.forEach((payment: any) => {
          if (!payment.category || payment.category.trim() === '') return

          const business = payment.merchant
          console.log("business:", business)

          if (!businessToCategories.has(business)) {
            businessToCategories.set(business, new Map())
          }

          const categoryCounts = businessToCategories.get(business)!
          const currentCount = categoryCounts.get(payment.category) || 0
          categoryCounts.set(payment.category, currentCount + 1)
        })
      })
    })

    // Pick the most common category for each business
    const businessToCategoryMap = new Map<string, string>()

    businessToCategories.forEach((categoryCounts, business) => {
      let bestCategory = ''
      let bestCount = 0

      categoryCounts.forEach((count, category) => {
        if (count > bestCount) {
          bestCount = count
          bestCategory = category
        }
      })

      if (bestCategory) {
        businessToCategoryMap.set(business, bestCategory)
      }
    })

    return businessToCategoryMap
  },

  // Auto-classify unclassified transactions based on previous classifications
  autoClassify: (selectedMonth: string): { count: number; classifiedIds: string[] } => {
    const businessMap = transactionStore.getBusinessCategoryMap(selectedMonth)
    const budgetTransactions = transactionStore.getBudgetTransactions(selectedMonth)

    const classifiedIds: string[] = []
    let successfulMatches = 0

    // Filter unclassified transactions
    const unclassified = budgetTransactions.filter(t => !t.category || t.category.trim() === '')

    for (const transaction of unclassified) {
      // Search for category in learned map
      const suggestedCategory = businessMap.get(transaction.business)

      if (suggestedCategory) {
        // Update transaction with suggested category
        transactionStore.updateAny(transaction.id, { category: suggestedCategory })
        classifiedIds.push(transaction.id)
        successfulMatches++
      }
    }

    console.log(`✅ Auto-classified ${successfulMatches}/${unclassified.length} transactions`)
    return { count: classifiedIds.length, classifiedIds }
  },

  // Save complete transaction data
  saveData: (data: TransactionStorage) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },

  // Clear all transaction data
  clearData: () => {
    localStorage.removeItem(STORAGE_KEY)
  },

  // Save imported files metadata
  saveImportedFiles: (data: any) => {
    localStorage.setItem(IMPORTED_FILES_KEY, JSON.stringify(data))
  },

  // Delete transactions for a specific file
  deleteTransactionsForFile: (fileType: string, processingMonth: string, cardNumber?: string) => {
    const data = transactionStore.getData()
    if (!data) return

    if (fileType === 'bank') {
      // Remove bank transactions for this month
      data.transactions = data.transactions.filter((t: any) => {
        const transactionMonth = t.date.substring(3)
        return transactionMonth !== processingMonth
      })
    } else if (fileType === 'credit-card' && cardNumber) {
      // Remove credit card data for this card and month
      const creditData = data.creditCardData || {}
      if (creditData[cardNumber] && creditData[cardNumber][processingMonth]) {
        delete creditData[cardNumber][processingMonth]

        // If no months left for this card, remove the card entirely
        if (Object.keys(creditData[cardNumber]).length === 0) {
          delete creditData[cardNumber]
        }
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },

  // Get transactions with calculated running balances
  getTransactionsWithBalances: (transactions: Transaction[]): Transaction[] => {
    if (transactions.length === 0) return []

    const result = [...transactions]

    // Work backwards to calculate missing balances
    // If balance is 0, take next transaction's balance minus current amount
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].balance === 0 && i < result.length - 1) {
        result[i] = {
          ...result[i],
          balance: result[i + 1].balance - result[i].amount
        }
      }
    }

    return result
  },
}
