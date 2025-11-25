// Transaction Store - Handles all localStorage operations for transactions

import type {
  BudgetTransaction,
  TransactionUpdate,
  Transaction,
  TransactionStorage,
  CreditCardPayment,
  CreditCardData,
} from '@/app/types/transactions'

const STORAGE_KEY = 'finance-transactions'
const IMPORTED_FILES_KEY = 'finance-imported-files'

export const transactionStore = {
  // Get all data from storage
  getData: () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  },

  // Get imported files data
  getImportedFiles: () => {
    const stored = localStorage.getItem(IMPORTED_FILES_KEY)
    return stored ? JSON.parse(stored) : null
  },

  // Save credit card transactions
  saveCreditCardData: (cardNumber: string, payments: CreditCardPayment[], chargingDate?: string) => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const data: TransactionStorage = stored
      ? JSON.parse(stored)
      : {
          version: '1.0',
          processingMonth: null,
          transactions: [],
          creditCardData: [],
          loadedFiles: [],
          lastUpdated: '',
        }

    const cardData: CreditCardData = {
      cardNumber,
      payments: payments.map((p) => ({ ...p, chargingDate })),
    }

    const existingIndex = data.creditCardData.findIndex((cc) => cc.cardNumber === cardNumber)

    if (existingIndex !== -1) {
      data.creditCardData[existingIndex] = cardData
    } else {
      data.creditCardData.push(cardData)
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
          version: '1.0',
          processingMonth: null,
          transactions: [],
          creditCardData: [],
          loadedFiles: [],
          lastUpdated: '',
        }

    // Remove old transactions for this month
    data.transactions = data.transactions.filter((t) => t.date.substring(3) !== processingMonth)

    // Add new transactions
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

    // Add credit card payments by charging date (when money leaves account)
    const creditData = data.creditCardData || []
    creditData.forEach((cc: any) => {
      cc.payments.forEach((payment: any) => {
        // Use charging date for filtering budget (when the installment is paid)
        const chargingMonth = payment.chargingDate ? payment.chargingDate.substring(3) : payment.transactionDate.substring(3)
        if (chargingMonth === selectedMonth) {
          // Calculate installment info
          let installmentInfo: string | undefined
          let totalAmount: number | undefined

          if (payment.totalSteps && payment.totalSteps > 1) {
            // This is an installment payment
            installmentInfo = `${payment.currentStep}/${payment.totalSteps}`
            totalAmount = -payment.amount * payment.totalSteps
          }

          budgetTransactions.push({
            id: payment.id,
            date: payment.transactionDate, // Show original transaction date (when purchased)
            business: payment.merchant,
            category: payment.category || '',
            amount: -payment.amount,
            isFixed: payment.isFixed || false,
            paymentMethod: cc.cardNumber, // Credit card last 4 digits
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

    // Update in creditCardData
    data.creditCardData = data.creditCardData.map((cc: any) => ({
      ...cc,
      payments: cc.payments.map((p: any) =>
        p.id === paymentId ? { ...p, ...updates } : p
      ),
    }))

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
      data.creditCardData = data.creditCardData.map((cc: any) => ({
        ...cc,
        payments: cc.payments.map((p: any) =>
          p.id === transactionId ? { ...p, ...updates } : p
        ),
      }))
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  },

  // Get relevant months for learning (current, previous, one before, and a year ago)
  getRelevantMonths: (selectedMonth: string): string[] => {
    const [month, year] = selectedMonth.split('/').map(Number)
    const months: string[] = []

    // Current month
    months.push(selectedMonth)

    // Previous month
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    months.push(`${String(prevMonth).padStart(2, '0')}/${prevYear}`)

    // One before that
    const prevPrevMonth = prevMonth === 1 ? 12 : prevMonth - 1
    const prevPrevYear = prevMonth === 1 ? prevYear - 1 : prevYear
    months.push(`${String(prevPrevMonth).padStart(2, '0')}/${prevPrevYear}`)

    // Same month a year ago
    months.push(`${String(month).padStart(2, '0')}/${year - 1}`)

    return months
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
    const creditData = data.creditCardData || []
    creditData.forEach((cc: any) => {
      cc.payments.forEach((payment: any) => {
        if (!payment.category || payment.category.trim() === '') return

        const chargingMonth = payment.chargingDate
          ? payment.chargingDate.substring(3)
          : payment.transactionDate.substring(3)
        if (!relevantMonths.includes(chargingMonth)) return

        const business = payment.merchant

        if (!businessToCategories.has(business)) {
          businessToCategories.set(business, new Map())
        }

        const categoryCounts = businessToCategories.get(business)!
        const currentCount = categoryCounts.get(payment.category) || 0
        categoryCounts.set(payment.category, currentCount + 1)
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
    const data = transactionStore.getData()
    if (!data) return { count: 0, classifiedIds: [] }

    const classifiedIds: string[] = []

    // Auto-classify bank transactions
    data.transactions = data.transactions.map((t: any) => {
      const transactionMonth = t.date.substring(3)
      if (transactionMonth === selectedMonth && (!t.category || t.category.trim() === '')) {
        const suggestedCategory = businessMap.get(t.description)
        if (suggestedCategory) {
          classifiedIds.push(t.id)
          return { ...t, category: suggestedCategory }
        }
      }
      return t
    })

    // Auto-classify credit card payments
    data.creditCardData = data.creditCardData.map((cc: any) => ({
      ...cc,
      payments: cc.payments.map((p: any) => {
        const chargingMonth = p.chargingDate ? p.chargingDate.substring(3) : p.transactionDate.substring(3)
        if (chargingMonth === selectedMonth && (!p.category || p.category.trim() === '')) {
          const suggestedCategory = businessMap.get(p.merchant)
          if (suggestedCategory) {
            classifiedIds.push(p.id)
            return { ...p, category: suggestedCategory }
          }
        }
        return p
      }),
    }))

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return { count: classifiedIds.length, classifiedIds }
  },
}
