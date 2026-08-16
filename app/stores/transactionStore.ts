// Transaction Store - Uses IndexedDB via Dexie
// Replaces localStorage-based store with normalized database

import { db, Transaction, ImportedFile } from '@/app/db/financeDB'
import { addMonths } from '@/app/utils/formatters'
import { canonicalizeForDedup } from '@/app/utils/dedupKey'
import { findDuplicateTransactions, type DuplicateGroup } from '@/app/utils/findDuplicateTransactions'
import { normalizeDate, parseDateMs } from '@/app/utils/parsers/shared'

/**
 * Extract MM/YYYY month from a date string.
 * Handles YYYY-MM-DD (canonical), DD/MM/YYYY, DD.MM.YY, DD.MM.YYYY formats.
 */
function extractMonth(dateStr: string): string {
  // Canonical YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-\d{2}$/)
  if (isoMatch) return `${isoMatch[2]}/${isoMatch[1]}`

  // Try DD/MM/YYYY first (standard format)
  const slashMatch = dateStr.match(/^\d{2}\/(\d{2}\/\d{4})$/)
  if (slashMatch) return slashMatch[1]

  // Try DD.MM.YY or DD.MM.YYYY
  const dotMatch = dateStr.match(/^\d{2}\.(\d{2})\.(\d{2,4})$/)
  if (dotMatch) {
    const mm = dotMatch[1]
    const yy = dotMatch[2]
    const yyyy = yy.length === 2 ? `20${yy}` : yy
    return `${mm}/${yyyy}`
  }

  // Fallback: substring(3) for DD/MM/YYYY
  return dateStr.substring(3)
}

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
      // Build file list directly from transactions (single source of truth).
      // A single imported file can span multiple months (e.g. a Feb-Jul bank
      // export) — group by (fileId, month) rather than fileId alone, so one
      // wide file emits one entry PER month it actually covers instead of
      // collapsing to whichever transaction happened to be encountered first.
      // Otherwise the wizard's month × account grid would show every month
      // but the first as "missing" even though it's already imported.
      const txns = await db.transactions.toArray()
      const byFileMonth = new Map<string, ImportedFile>()
      txns.forEach((t) => {
        const inferredMonth = t.chargingDate ? extractMonth(t.chargingDate) : t.month || ''
        const fileKey = t.fileId || `${t.type}-${inferredMonth || 'unknown'}-${t.cardNumber || t.accountNumber || 'n/a'}`
        const key = `${fileKey}|${inferredMonth}`
        const existing = byFileMonth.get(key)
        if (existing) {
          existing.transactionCount += 1
        } else {
          byFileMonth.set(key, {
            fileName: fileKey,
            fileKey: fileKey,
            fileType: t.type === 'credit' ? 'credit-card' : 'bank',
            processingMonth: inferredMonth,
            accountNumber: t.accountNumber,
            cardNumber: t.cardNumber,
            transactionCount: 1,
            importedAt: t.importedAt || new Date().toISOString(),
          })
        }
      })

      const files = Array.from(byFileMonth.values())
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
      // Scope-down chain: prefer the most precise key first.
      // The legacy type+month fallback is destructive (wipes ALL transactions
      // for the month, including categorized ones from other files), so it
      // only runs when no file-specific identifier is available.
      if (fileKey) {
        await db.transactions.where('fileId').equals(fileKey).delete()
      } else if (fileNameHint) {
        await db.transactions
          .filter((t) => typeof t.fileId === 'string' && t.fileId.includes(fileNameHint))
          .delete()
      } else if (fileType === 'bank') {
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

      // Primary dedup key: date + the bank's own reference/אסמכתא number +
      // amount. The reference is assigned by the bank itself, so it's identical
      // regardless of which import path (deterministic FIBI parser, XLS-LLM, or
      // PDF-LLM) extracted this row — but it is NOT unique on its own: the bank
      // recycles reference serials across transactions, and a bare-ref key
      // silently ate a new 27/07 row whose ref matched an unrelated old one.
      // Scoping by date+amount means only a true re-import of the same row matches.
      const refKey = (date: string, reference: string, amount: number) =>
        `${date}|${reference}|${amount}`
      const existingRefKeys = new Set<string>()
      for (const t of existingTransactions) {
        if (!t.reference) continue
        existingRefKeys.add(refKey(t.date, t.reference, t.amount))
      }
      // Fallback for rows without a reference (older imports, non-FIBI banks,
      // same-day/pending transactions the bank hasn't assigned one to yet):
      // canonicalized description (sorted chars, punctuation/case stripped) so
      // bidi-reordered text still dedupes correctly.
      const existingHeuristicKeys = new Set(
        existingTransactions.map((t) => `${t.date}|${canonicalizeForDedup(t.description)}|${t.amount}`)
      )

      // Filter out duplicates
      const newTransactions = transactions.filter((t) => {
        if (t.reference && existingRefKeys.has(refKey(t.date, t.reference, t.amount))) return false
        const key = `${t.date}|${canonicalizeForDedup(t.description)}|${t.amount}`
        return !existingHeuristicKeys.has(key)
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
        reference: t.reference,
        month: extractMonth(t.date),
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

      // Create a Set of existing transaction keys for quick lookup. Merchant is
      // canonicalized for the same reason as saveBankTransactions above — XLS vs
      // PDF import of the same statement can reorder bidi Hebrew/Latin text.
      const existingKeys = new Set(
        existingTransactions.map((t) => `${t.date}|${canonicalizeForDedup(t.merchant || '')}|${t.amount}|${t.currentStep}|${t.totalSteps}`)
      )

      // Filter out duplicates
      const newPayments = payments.filter((p) => {
        const key = `${p.transactionDate}|${canonicalizeForDedup(p.merchant || '')}|${-Math.abs(p.amount)}|${p.currentStep}|${p.totalSteps}`
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
        month: extractMonth(p.transactionDate),
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
        const chargingMonth = extractMonth(t.chargingDate)
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

      // Sort by transaction date — parseDateMs tolerates both the canonical
      // YYYY-MM-DD and legacy DD/MM/YYYY formats (a raw split('/') here
      // silently broke for the common YYYY-MM-DD case).
      allTransactions.sort((a, b) => parseDateMs(a.date) - parseDateMs(b.date))

      return allTransactions
    } catch (error) {
      console.error('Error getting budget transactions:', error)
      return []
    }
  },

  /**
   * All transactions (across every month) whose derived "business" label
   * exactly matches the given supplier name — powers the budget page's
   * supplier drill-down (click a supplier → see its full history and set
   * its subject from there). Newest first, unlike getBudgetTransactions.
   */
  getTransactionsByBusiness: async (business: string) => {
    try {
      const bankTransactions = (await db.transactions.where('type').equals('bank').toArray())
        .filter((t) => !t.isCreditCardCharge && t.description === business)
      const creditTransactions = (await db.transactions.where('type').equals('credit').toArray())
        .filter((t) => (t.merchant || t.description) === business)

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

      allTransactions.sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date))
      return allTransactions
    } catch (error) {
      console.error('Error getting transactions by business:', error)
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
      // 1. Load explicit business-category mappings
      const businessCategories = await db.businessCategories.toArray()
      const businessMap = new Map(businessCategories.map((bc) => [bc.business, bc.category]))

      // 2. Learn from all past classified transactions (any month)
      const allClassified = await db.transactions
        .filter(t => !!t.category && t.category.trim() !== '')
        .toArray()

      for (const t of allClassified) {
        const name = t.type === 'credit' ? (t.merchant || t.description) : t.description
        if (name && !businessMap.has(name)) {
          businessMap.set(name, t.category!)
        }
      }

      // 3. Get current month's transactions and classify unclassified ones
      const allTransactions = await transactionStore.getBudgetTransactions(selectedMonth)
      const classifiedIds: string[] = []
      const unclassified = allTransactions.filter((t) => !t.category || t.category.trim() === '')

      for (const transaction of unclassified) {
        let suggestedCategory = businessMap.get(transaction.business)

        // Fallback: substring match with longest-key-wins
        // e.g. "פזי קפה סניף חיפה" matches "פזי קפה" (7 chars) over "פז" (2 chars)
        if (!suggestedCategory) {
          const bizLower = transaction.business.toLowerCase()
          let bestLen = 0
          for (const [key, cat] of businessMap) {
            const keyLower = key.toLowerCase()
            if (bizLower.includes(keyLower) && keyLower.length > bestLen) {
              suggestedCategory = cat
              bestLen = keyLower.length
            }
          }
        }

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

  /**
   * Find duplicate transactions across ALL bank/credit imports (not scoped to
   * one month/account) — same grouping rule as the import-time dedup key
   * (reference number first, canonicalized description as fallback). Never
   * suggests removing a transaction that has its own linked ExpenseDocument
   * unless multiple duplicates in the group each have one, in which case the
   * group is flagged for manual review instead. Read-only.
   */
  findDuplicates: async (month?: string): Promise<DuplicateGroup[]> => {
    const [transactions, docs] = await Promise.all([
      month ? db.transactions.where('month').equals(month).toArray() : db.transactions.toArray(),
      db.expenseDocuments.toArray(),
    ])
    const linkedTransactionSyncIds = new Set(
      docs.filter((d) => d.transactionId != null).map((d) => d.transactionId as string)
    )
    return findDuplicateTransactions(transactions, linkedTransactionSyncIds)
  },

  /**
   * Bulk-delete transactions by id. Used by the duplicate-cleanup tool after
   * explicit user confirmation — never called silently.
   */
  deleteTransactions: async (ids: number[]): Promise<boolean> => {
    try {
      await db.transactions.bulkDelete(ids)
      return true
    } catch (error) {
      console.error('Error deleting transactions:', error)
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
    cutoffDay = getDayOfMonth(currentStatement[0].chargingDate)
  }

  const result: any[] = []

  // Add transactions from current statement
  currentStatement.forEach((t) => {
    const isInstallment = (t.totalSteps || 1) > 1
    const transactionDay = getDayOfMonth(t.date)

    if (isInstallment || transactionDay <= cutoffDay) {
      result.push(formatCreditTransaction(t))
    }
  })

  // Add transactions from next statement (second half)
  const lastDayOfMonth = new Date(year, month, 0).getDate()
  nextStatement.forEach((t) => {
    const isNewInstallment = t.currentStep === 1 && (t.totalSteps || 1) > 1
    const isSinglePayment = (t.totalSteps || 1) === 1
    const transactionDay = getDayOfMonth(t.date)

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

function getDayOfMonth(dateStr?: string): number {
  const normalized = normalizeDate(dateStr)
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return 0
  const day = Number(normalized.split('-')[2])
  return Number.isFinite(day) ? day : 0
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
