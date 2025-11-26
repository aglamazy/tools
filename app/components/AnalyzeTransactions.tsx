'use client'

import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import type { SheetRow, SheetCell, Transaction, ParseResult, TransactionStorage } from '@/app/types/transactions'
import type { Category, Classification } from '@/app/types/category'
import type { MonthSnapshot, CategoryBreakdown } from '@/app/types/history'
import FileSelectModal from './FileSelectModal'
import YesNoModal from './YesNoModal'
import { parseCreditCardStatement } from '@/app/utils/creditCardParser'
import {
  clearDirectoryHandle,
  loadDirectoryHandle,
  requestDirectoryPermission,
} from '@/app/utils/directoryStorage'
import { transactionStore } from '@/app/stores/transactionStore'
import { subjectStore } from '@/app/stores/subjectStore'
import { historyStore } from '@/app/stores/historyStore'

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
})

const normalizeCell = (value: SheetCell): string | number => {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number') {
    return value
  }
  return ''
}

const toNumber = (value: string | number): number => {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '')
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const extractProcessingMonth = (transactions: Transaction[]): string | null => {
  // Get the first transaction's month
  if (transactions.length === 0) {
    return null
  }

  const firstTransaction = transactions[0]
  const transactionDate = parseTransactionDate(firstTransaction.date)

  if (transactionDate) {
    return `${transactionDate.month}/${transactionDate.year}`
  }

  return null
}

const parseTransactionDate = (dateStr: string): { month: string; year: string } | null => {
  // Expected format: DD/MM/YYYY
  const match = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (match) {
    const [, , month, year] = match
    return { month, year }
  }
  return null
}

const detectFileType = (rows: Array<Array<string | number>>): 'fibi-transactions' | 'credit-card' | 'unknown' => {
  // Check for FIBI bank transactions (has "חובה" and "זכות" columns)
  const hasFibiHeaders = rows.some((row) =>
    row.some((cell) => typeof cell === 'string' && cell.includes('תאריך')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('חובה')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('זכות'))
  )

  if (hasFibiHeaders) {
    return 'fibi-transactions'
  }

  // Check for credit card statement (has "סכום חיוב" and "פירוט" columns)
  const hasCreditCardHeaders = rows.some((row) =>
    row.some((cell) => typeof cell === 'string' && cell.includes('סכום חיוב')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('פירוט'))
  )

  if (hasCreditCardHeaders) {
    return 'credit-card'
  }

  return 'unknown'
}

const parseTransactions = (rows: SheetRow[] = []): ParseResult => {
  const sanitized = rows.map((row) => row.map(normalizeCell)) as Array<Array<string | number>>

  // Detect file type
  const fileType = detectFileType(sanitized)

  // If it's a credit card file, don't create transactions
  // The data will be stored separately and linked to bank transactions
  if (fileType === 'credit-card') {
    const statement = parseCreditCardStatement(rows)

    // Extract month from billing date
    let processingMonth: string | null = null
    if (statement.billingDate) {
      const month = (statement.billingDate.getMonth() + 1).toString().padStart(2, '0')
      const year = statement.billingDate.getFullYear().toString()
      processingMonth = `${month}/${year}`
    }

    return { transactions: [], processingMonth }
  }

  // Otherwise, use FIBI bank transaction parser
  // Find header row (row with "תאריך", "חובה", "זכות", etc.)
  const headerIndex = sanitized.findIndex((row) =>
    row.some((cell) => typeof cell === 'string' && cell.includes('תאריך')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('חובה'))
  )

  if (headerIndex === -1) {
    console.log('Header row not found')
    return { transactions: [], processingMonth: null }
  }

  console.log('Header found at index:', headerIndex)

  const headers = sanitized[headerIndex]
  const findIndex = (text: string) =>
    headers.findIndex((cell) => typeof cell === 'string' && cell.includes(text))

  const dateIdx = findIndex('תאריך')
  const descriptionIdx = findIndex('תיאור')
  const debitIdx = findIndex('חובה')
  const creditIdx = findIndex('זכות')
  const typeIdx = findIndex('אסמכתא')
  const activityIdx = findIndex('סוג פעולה')
  const balanceIdx = findIndex('יתרה')

  if (dateIdx === -1 || descriptionIdx === -1) {
    console.log('Required columns not found')
    return { transactions: [], processingMonth: null }
  }

  // First pass: collect all transactions
  const allTransactions: Transaction[] = []
  const rowsAfterHeader = sanitized.slice(headerIndex + 1)

  rowsAfterHeader.forEach((row, rowIndex) => {
    const date = row[dateIdx]
    const description = row[descriptionIdx]

    // Skip empty rows or the "יתרת חודש קודם" row
    if (!date || !description) {
      return
    }

    // Skip if description contains "יתרת חודש קודם"
    if (typeof description === 'string' && description.includes('יתרת חודש קודם')) {
      return
    }

    const debit = debitIdx !== -1 ? toNumber(row[debitIdx]) : 0
    const credit = creditIdx !== -1 ? toNumber(row[creditIdx]) : 0
    const amount = debit !== 0 ? -debit : credit
    const balance = balanceIdx !== -1 ? toNumber(row[balanceIdx]) : 0

    // Detect credit card charges - look for card number in description
    const descriptionStr = String(description)
    const cardNumberMatch = descriptionStr.match(/(\d{4})\s*-?\s*ישראכרט/)
    const isCreditCard = !!cardNumberMatch
    const cardNumber = cardNumberMatch ? cardNumberMatch[1] : null

    allTransactions.push({
      id: `${rowIndex}-${date}-${String(description).slice(0, 30)}-${amount}`,
      date: String(date),
      description: String(description),
      amount,
      type: typeIdx !== -1 ? String(row[typeIdx] || '') : '',
      activity: activityIdx !== -1 ? String(row[activityIdx] || '') : '',
      balance,
      cardNumber,
      isCreditCardCharge: isCreditCard,
    })
  })

  // Extract processing month from first transaction
  const processingMonth = extractProcessingMonth(allTransactions)
  console.log('Processing month:', processingMonth)

  // Second pass: filter by processing month
  const transactions = allTransactions.filter((transaction) => {
    if (!processingMonth) {
      return true // If no month found, include all
    }

    const transactionDate = parseTransactionDate(transaction.date)
    if (transactionDate) {
      const transactionMonthYear = `${transactionDate.month}/${transactionDate.year}`
      if (transactionMonthYear !== processingMonth) {
        console.log(`Skipping transaction from different month: ${transaction.date} (expected ${processingMonth})`)
        return false
      }
    }
    return true
  })

  console.log('Parsed transactions:', transactions.length)
  return { transactions, processingMonth }
}

type CreditCardData = {
  cardNumber: string
  payments: Array<{
    id: string
    transactionDate: string
    merchant: string
    amount: number
    currentStep: number
    totalSteps: number
    chargingDate?: string // Date when money is debited from bank account (תאריך חיוב)
  }>
}

export default function AnalyzeTransactions() {
  const [loadedFiles, setLoadedFiles] = useState<string[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [creditCardData, setCreditCardData] = useState<Map<string, CreditCardData>>(new Map())
  const [processingMonth, setProcessingMonth] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAdditionalFile, setIsAdditionalFile] = useState(false)
  const [expandedTransaction, setExpandedTransaction] = useState<string | null>(null)
  const [savedDirHandle, setSavedDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [classifications, setClassifications] = useState<Map<string, string>>(new Map()) // transactionId -> categoryId
  const [classificationRecords, setClassificationRecords] = useState<Classification[]>([])
  const [classificationWarnings, setClassificationWarnings] = useState<Map<string, number>>(new Map()) // transactionId -> delta pct
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Load from LocalStorage on mount
  useEffect(() => {
    loadFromStorage()
    loadCategories()
    initDirectoryHandle()
  }, [])

  useEffect(() => {
    // Restore warning indicators for already-stored classifications
    const warnMap = new Map<string, number>()
    classificationRecords.forEach((rec) => {
      if (rec.amountChangeWarningPct && rec.amountChangeWarningPct > 0.01) {
        warnMap.set(rec.transactionId, rec.amountChangeWarningPct)
      }
    })
    setClassificationWarnings(warnMap)
  }, [classificationRecords])

  useEffect(() => {
    if (!processingMonth) return
    // Always load fresh categories from localStorage to ensure isFixed and other properties are current
    const freshCategories = loadCategoriesFromStorage()
    const snapshot = buildSnapshot(
      processingMonth,
      transactions,
      creditCardData,
      classifications,
      freshCategories,
      loadedFiles
    )
    saveHistorySnapshot(snapshot)
  }, [processingMonth, transactions, creditCardData, classifications, categories, loadedFiles])

  // Auto-save whenever data changes
  useEffect(() => {
    if (transactions.length > 0 || creditCardData.size > 0) {
      saveToStorage()
    }
  }, [transactions, creditCardData, loadedFiles, processingMonth])

  const saveToStorage = () => {
    try {
      const data: TransactionStorage = {
        version: '1.0',
        processingMonth,
        transactions,
        creditCardData: Array.from(creditCardData.values()),
        loadedFiles,
        lastUpdated: new Date().toISOString(),
      }
      transactionStore.saveData(data)
      console.log('Saved transactions to localStorage:', {
        transactionCount: transactions.length,
        creditCards: creditCardData.size,
        files: loadedFiles.length,
      })
    } catch (err) {
      console.error('Error saving transactions:', err)
    }
  }

  const initDirectoryHandle = async () => {
    const handle = await loadDirectoryHandle()
    if (handle) {
      const hasPermission = await requestDirectoryPermission(handle, 'read')
      if (hasPermission) {
        setSavedDirHandle(handle)
      } else {
        setSavedDirHandle(null)
      }
    }
  }

  const loadFromStorage = () => {
    try {
      const data = transactionStore.getData()
      if (data) {
        setTransactions(data.transactions || [])
        setProcessingMonth(data.processingMonth)
        setLoadedFiles(data.loadedFiles || [])

        // Restore credit card data as Map
        const ccMap = new Map<string, CreditCardData>()
        data.creditCardData?.forEach((cc: CreditCardData) => {
          ccMap.set(cc.cardNumber, cc)
        })
        setCreditCardData(ccMap)

        console.log('Loaded transactions from localStorage:', {
          transactionCount: data.transactions?.length || 0,
          creditCards: data.creditCardData?.length || 0,
          files: data.loadedFiles?.length || 0,
        })
      }
    } catch (err) {
      console.error('Error loading transactions:', err)
    }
  }

  const loadCategoriesFromStorage = (): Category[] => {
    return subjectStore.getAll().map((cat: Category) => ({
      ...cat,
      isFixed: cat.isFixed ?? false,
    }))
  }

  const loadCategories = () => {
    try {
      const normalizedCategories = subjectStore.getAll().map((cat: Category) => ({
        ...cat,
        isFixed: cat.isFixed ?? false,
      }))
      setCategories(normalizedCategories)

      // Load classifications
      const classMap = new Map<string, string>()
      const records = subjectStore.getClassifications()
      records.forEach((c: Classification) => {
        classMap.set(c.transactionId, c.categoryId)
      })
      setClassifications(classMap)
      setClassificationRecords(records)

      console.log('Loaded categories:', {
        categoryCount: normalizedCategories.length,
        classificationCount: records.length,
      })
    } catch (err) {
      console.error('Error loading categories:', err)
    }
  }

  const normalizeDescription = (text: string) =>
    text.trim().replace(/\s+/g, ' ')

  const computeSign = (amount: number): 'income' | 'expense' =>
    amount >= 0 ? 'income' : 'expense'

  const parseMonthYear = (monthYear: string) => {
    const [m, y] = monthYear.split('/').map((v) => parseInt(v, 10))
    return { month: m, year: y }
  }

  const saveClassification = (
    transactionId: string,
    categoryId: string | null,
    meta?: { description?: string; amount?: number; monthYear?: string | null; warningDeltaPct?: number; matchSourceMonthYear?: string }
  ) => {
    const descriptionKey = meta?.description ? normalizeDescription(meta.description) : undefined
    const amount = meta?.amount
    const sign = typeof amount === 'number' ? computeSign(amount) : undefined
    const monthYear = meta?.monthYear || processingMonth || ''

    setClassifications((prev) => {
      const newMap = new Map(prev)
      if (categoryId) {
        newMap.set(transactionId, categoryId)
      } else {
        newMap.delete(transactionId)
      }

      setClassificationWarnings((prevWarn) => {
        const warnMap = new Map(prevWarn)
        if (categoryId && meta?.warningDeltaPct && meta.warningDeltaPct > 0.01) {
          warnMap.set(transactionId, meta.warningDeltaPct)
        } else {
          warnMap.delete(transactionId)
        }
        return warnMap
      })

      // Save classification to store
      try {
        if (categoryId) {
          const classification: Classification = {
            transactionId,
            categoryId,
            monthYear,
            classifiedAt: new Date().toISOString(),
            descriptionKey,
            amount,
            sign,
            matchDeltaPct: meta?.warningDeltaPct,
            matchSourceMonthYear: meta?.matchSourceMonthYear,
            amountChangeWarningPct: meta?.warningDeltaPct,
          }
          subjectStore.saveClassification(classification)
        } else {
          subjectStore.removeClassification(transactionId)
        }

        const nextRecords = subjectStore.getClassifications()
        setClassificationRecords(nextRecords)
        console.log('Saved classification:', {
          transactionId,
          categoryId,
          totalClassifications: nextRecords.length,
          warning: meta?.warningDeltaPct,
        })
      } catch (err) {
        console.error('Error saving classification:', err)
      }

      return newMap
    })
  }

  const processFile = async (file: File, isAdditional: boolean = false) => {
    setError('')

    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      try {
        const arrayBuffer = loadEvent.target?.result
        if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
          setError('אירעה שגיאה בקריאת הקובץ. נסה לבחור קובץ XLS תקין.')
          return
        }
        const data = new Uint8Array(arrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
          header: 1,
          raw: false,
        })

        // Detect file type
        const sanitized = rows.map((row) => row.map(normalizeCell)) as Array<Array<string | number>>
        const fileType = detectFileType(sanitized)

        const result = parseTransactions(rows)

        // If this is an additional file, validate month compatibility
        if (isAdditional && processingMonth && result.processingMonth) {
          // For credit card files, allow current month or next month (billing cycle)
          // For bank files, must be exact match
          if (fileType === 'credit-card') {
            const [currentMonth, currentYear] = processingMonth.split('/').map(v => parseInt(v, 10))
            const [fileMonth, fileYear] = result.processingMonth.split('/').map(v => parseInt(v, 10))

            // Calculate month difference
            const monthDiff = (fileYear - currentYear) * 12 + (fileMonth - currentMonth)

            // Allow same month (0) or next month (1)
            if (monthDiff < 0 || monthDiff > 1) {
              setError(`הקובץ הזה משייך לחודש ${result.processingMonth} אבל אתה מנתח ${processingMonth}. עבור כרטיס אשראי, ניתן לטעון קבצים מהחודש הנוכחי או הבא.`)
              return
            }
          } else {
            // Bank files must match exactly
            if (result.processingMonth !== processingMonth) {
              setError(`הקובץ הזה משייך לחודש ${result.processingMonth} אבל אתה מנתח ${processingMonth}. אנא בחר קובץ מאותו חודש.`)
              return
            }
          }
        }

        // If this is a credit card file, store the credit card data
        const statement = fileType === 'credit-card' ? parseCreditCardStatement(rows) : null
        if (statement && statement.cardNumber) {
          const chargingDateStr = statement.billingDate ?
            `${String(statement.billingDate.getDate()).padStart(2, '0')}/${String(statement.billingDate.getMonth() + 1).padStart(2, '0')}/${statement.billingDate.getFullYear()}`
            : undefined

          // Add charging date to each payment
          const paymentsWithChargingDate = statement.payments.map(p => ({
            ...p,
            chargingDate: chargingDateStr,
          }))

          setCreditCardData((prev) => {
            const newMap = new Map(prev)
            const existing = newMap.get(statement.cardNumber!)

            if (existing && isAdditional) {
              // Merge payments, avoiding duplicates by payment ID
              const existingPaymentIds = new Set(existing.payments.map(p => p.id))
              const newPayments = paymentsWithChargingDate.filter(p => !existingPaymentIds.has(p.id))

              newMap.set(statement.cardNumber!, {
                cardNumber: statement.cardNumber!,
                payments: [...existing.payments, ...newPayments],
              })
            } else {
              // First file or not additional - replace
              newMap.set(statement.cardNumber!, {
                cardNumber: statement.cardNumber!,
                payments: paymentsWithChargingDate,
              })
            }

            return newMap
          })

          // For credit card files, just add to loaded files
          setLoadedFiles((prev) => isAdditional ? [...prev, file.name] : [file.name])
          if (!isAdditional && result.processingMonth) {
            setProcessingMonth(result.processingMonth)
          }
        } else {
          // For bank transaction files
          if (!result.transactions.length) {
            setError('לא נמצאו עסקאות בקובץ שנבחר.')
            return
          }

          if (isAdditional) {
            // Check for duplicates before merging
            const existingIds = new Set(transactions.map(t => t.id))
            const newTransactions = result.transactions.filter(t => !existingIds.has(t.id))

            if (newTransactions.length === 0) {
              setError('כל העסקאות מהקובץ כבר קיימות.')
              return
            }

            // Merge with existing transactions
            setTransactions((prev) => [...prev, ...newTransactions])
            setLoadedFiles((prev) => [...prev, file.name])
            applyHistoricalClassifications(newTransactions, processingMonth)

            console.log(`Added ${newTransactions.length} new transactions (${result.transactions.length - newTransactions.length} duplicates skipped)`)
          } else {
            // Replace transactions
            setTransactions(result.transactions)
            setProcessingMonth(result.processingMonth)
            setLoadedFiles([file.name])
            applyHistoricalClassifications(result.transactions, result.processingMonth)
          }
        }
      } catch (err) {
        console.error(err)
        setError('אירעה שגיאה בקריאת הקובץ. נסה לבחור קובץ XLS תקין.')
      }
    }

    reader.onerror = () => {
      setError('קריאת הקובץ נכשלה. נסה שוב.')
    }

    reader.readAsArrayBuffer(file)
  }

  const handleModalFileSelect = (file: File) => {
    processFile(file, isAdditionalFile)
  }

  const handleDirHandleChange = async (handle: FileSystemDirectoryHandle | null) => {
    setSavedDirHandle(handle)
    if (!handle) {
      await clearDirectoryHandle()
    }
  }

  const handleOpenModal = () => {
    setIsAdditionalFile(false)
    setIsModalOpen(true)
  }

  const handleOpenAdditionalModal = () => {
    setIsAdditionalFile(true)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const totalIncome = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpenses = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const netAmount = totalIncome - totalExpenses

  const handleReset = () => {
    setShowResetConfirm(true)
  }

  const confirmReset = () => {
    setLoadedFiles([])
    setTransactions([])
    setCreditCardData(new Map())
    setProcessingMonth(null)
    setClassificationWarnings(new Map())
    setClassificationRecords([])
    setError('')

    // Clear from localStorage
    transactionStore.clearData()
    console.log('Cleared all transaction data')
    setShowResetConfirm(false)
  }

  const formatMonthDisplay = (monthStr: string | null): string => {
    if (!monthStr) return ''
    const [month, year] = monthStr.split('/')
    const monthNames = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ]
    const monthName = monthNames[parseInt(month, 10) - 1]
    return `${monthName} ${year}`
  }

  const monthsBetween = (a: string, b: string) => {
    const [ma, ya] = a.split('/').map((v) => parseInt(v, 10))
    const [mb, yb] = b.split('/').map((v) => parseInt(v, 10))
    return (yb - ya) * 12 + (mb - ma)
  }

  const parseMonthFromDateString = (dateStr: string): string | null => {
    const parsed = parseTransactionDate(dateStr)
    if (!parsed) return null
    return `${parsed.month}/${parsed.year}`
  }

  const saveHistorySnapshot = (snapshot: MonthSnapshot) => {
    historyStore.saveSnapshot(snapshot)
  }

  const buildSnapshot = (
    monthYear: string,
    txs: Transaction[],
    ccData: Map<string, CreditCardData>,
    classMap: Map<string, string>,
    cats: Category[],
    files: string[]
  ): MonthSnapshot => {
    const incomeTotal = { value: 0 }
    const expenseTotal = { value: 0 }
    const breakdown = new Map<string, CategoryBreakdown>()
    let unclassifiedCount = 0

    const addToBreakdown = (categoryId: string, amount: number) => {
      const cat = cats.find((c) => c.id === categoryId)
      if (!cat) return

      const existing = breakdown.get(categoryId) || {
        categoryId,
        categoryName: cat.name,
        type: cat.type,
        color: cat.color,
        total: 0,
        count: 0,
      }

      existing.total += amount
      existing.count += 1
      breakdown.set(categoryId, existing)
    }

    const handleAmount = (amount: number) => {
      if (amount >= 0) {
        incomeTotal.value += amount
      } else {
        expenseTotal.value += Math.abs(amount)
      }
    }

    // Bank transactions
    txs.forEach((tx) => {
      const txMonth = parseMonthFromDateString(tx.date)
      if (txMonth !== monthYear) return

      handleAmount(tx.amount)
      const catId = classMap.get(tx.id)
      if (catId) {
        addToBreakdown(catId, tx.amount)
      } else {
        unclassifiedCount += 1
      }
    })

    // Credit card payments
    ccData.forEach((cc) => {
      cc.payments.forEach((payment) => {
        const transactionMonth = parseMonthFromDateString(payment.transactionDate)
        const isInstallment = payment.totalSteps > 1

        if (isInstallment) {
          // Installment: count in the month it's charged (charging month), not transaction month
          if (payment.chargingDate) {
            const chargingMonth = parseMonthFromDateString(payment.chargingDate)
            // Only count this installment if the charging month matches analysis month
            if (chargingMonth !== monthYear) {
              console.log(`[INSTALLMENT FILTERED] ${payment.merchant} - chargingMonth: ${chargingMonth} vs monthYear: ${monthYear}`)
              return
            }
          } else {
            // No charging date - skip installments (we can't determine when to count them)
            console.log(`[INSTALLMENT SKIPPED - NO CHARGING DATE] ${payment.merchant}`)
            return
          }
        } else {
          // Regular transaction (1/1): count in the month the transaction was made
          if (transactionMonth !== monthYear) {
            console.log(`[REGULAR FILTERED] ${payment.merchant} - transactionMonth: ${transactionMonth} vs monthYear: ${monthYear}, transactionDate: ${payment.transactionDate}`)
            return
          }
          console.log(`[REGULAR INCLUDED] ${payment.merchant} - transactionMonth: ${transactionMonth} = monthYear: ${monthYear}, transactionDate: ${payment.transactionDate}`)
        }

        const amount = -Math.abs(payment.amount)
        handleAmount(amount)
        const catId = classMap.get(payment.id)
        if (catId) {
          addToBreakdown(catId, amount)
        } else {
          unclassifiedCount += 1
        }
      })
    })

    const net = incomeTotal.value - expenseTotal.value

    return {
      monthYear,
      income: incomeTotal.value,
      expense: expenseTotal.value,
      net,
      fileNames: files,
      categories: Array.from(breakdown.values()),
      unclassifiedCount,
      transactionCount: txs.length,
      lastUpdated: new Date().toISOString(),
    }
  }

  const applyHistoricalClassifications = (txs: Transaction[], monthYear: string | null) => {
    if (!monthYear || !classificationRecords.length) return

    const history = classificationRecords.filter((rec) => {
      if (!rec.monthYear || !rec.categoryId || !rec.descriptionKey || typeof rec.amount !== 'number' || !rec.sign) {
        return false
      }
      const diff = monthsBetween(rec.monthYear, monthYear)
      // Look back up to 2 months, current month, and one month ahead
      return diff >= -2 && diff <= 1
    })

    if (!history.length) return

    const historyByKey = new Map<string, Classification[]>()
    history.forEach((rec) => {
      const key = `${rec.descriptionKey}|${rec.sign}`
      const list = historyByKey.get(key) || []
      list.push(rec)
      historyByKey.set(key, list)
    })

    txs.forEach((tx) => {
      const descriptionKey = normalizeDescription(tx.description)
      const sign = computeSign(tx.amount)
      const candidates = historyByKey.get(`${descriptionKey}|${sign}`)
      if (!candidates || !candidates.length) return

      const sorted = candidates
        .map((rec) => {
          const base = Math.max(1, Math.abs(rec.amount || 0))
          const deltaPct = Math.abs(Math.abs(tx.amount) - Math.abs(rec.amount || 0)) / base
          const recency = rec.monthYear ? monthsBetween(rec.monthYear, monthYear) : 99
          return { rec, deltaPct, recency: Math.abs(recency) }
        })
        .sort((a, b) => a.deltaPct !== b.deltaPct ? a.deltaPct - b.deltaPct : a.recency - b.recency)

      const best = sorted[0]
      if (!best || !best.rec.categoryId) return

      const warningDeltaPct = best.deltaPct > 0.01 ? best.deltaPct : undefined
      saveClassification(tx.id, best.rec.categoryId, {
        description: tx.description,
        amount: tx.amount,
        monthYear,
        warningDeltaPct,
        matchSourceMonthYear: best.rec.monthYear,
      })
    })
  }

  return (
    <div className="card">
      <header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>ניתוח עסקאות בנק</h1>
            {!transactions.length && (
              <p>העלה את קובץ ה-XLS של תנועות הבנק כדי לנתח את העסקאות מהחודש הקודם.</p>
            )}
            {processingMonth && (
              <div className="processing-month-badge">
                חודש מעובד: {formatMonthDisplay(processingMonth)}
              </div>
            )}
            {loadedFiles.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  קבצים שנטענו:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {loadedFiles.map((fileName, index) => (
                    <div key={index} className="loaded-file-badge">
                      {fileName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {transactions.length > 0 && (
            <button onClick={handleReset} className="upload-another-btn">
              התחל מחדש
            </button>
          )}
        </div>
      </header>

      {!transactions.length && (
        <>
          <button onClick={handleOpenModal} className="file-picker">
            <span>פתח קובץ</span>
          </button>

          <p className="note">הערה: הקבצים לא מועלים לשרת ומנותחים במחשב שלך.</p>
        </>
      )}

      {error && <div className="banner error">{error}</div>}

      {transactions.length > 0 && (
        <>
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#475569' }}>
              הוסף קובץ נוסף מאותו חודש
            </h3>
            <button onClick={handleOpenAdditionalModal} className="file-picker secondary">
              <span>פתח קובץ נוסף</span>
            </button>
          </div>
        </>
      )}

      {transactions.length > 0 && (
        <>
          <section className="summary-grid">
            <div className="summary-card income">
              <div className="summary-label">הכנסות</div>
              <div className="summary-amount">{currencyFormatter.format(totalIncome)}</div>
              <div className="summary-count">
                {transactions.filter((t) => t.amount > 0).length} עסקאות
              </div>
            </div>
            <div className="summary-card expenses">
              <div className="summary-label">הוצאות</div>
              <div className="summary-amount">{currencyFormatter.format(totalExpenses)}</div>
              <div className="summary-count">
                {transactions.filter((t) => t.amount < 0).length} עסקאות
              </div>
            </div>
            <div className="summary-card net">
              <div className="summary-label">מאזן</div>
              <div className="summary-amount">{currencyFormatter.format(netAmount)}</div>
              <div className="summary-count">{transactions.length} עסקאות כולל</div>
            </div>
          </section>

          <section className="details">
            <div className="details-header">
              <h2>כל העסקאות</h2>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>תאריך</th>
                    <th>תיאור</th>
                    <th>נושא</th>
                    <th>סוג פעולה</th>
                    <th>סכום</th>
                    <th>יתרה</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <React.Fragment key={transaction.id}>
                      <tr
                        className={transaction.isCreditCardCharge ? 'credit-card-row' : ''}
                        onClick={() => {
                          if (transaction.isCreditCardCharge) {
                            setExpandedTransaction(
                              expandedTransaction === transaction.id ? null : transaction.id
                            )
                          }
                        }}
                      >
                        <td>{transaction.date}</td>
                        <td className={transaction.isCreditCardCharge ? 'credit-card-link' : ''}>
                          {transaction.description}
                          {transaction.isCreditCardCharge && (
                            <span className="expand-indicator">
                              {expandedTransaction === transaction.id ? ' ▼' : ' ◀'}
                            </span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {transaction.isCreditCardCharge ? (
                            <span style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                              תשלום כרטיס
                            </span>
                          ) : (
                            <select
                              value={classifications.get(transaction.id) || ''}
                              onChange={(e) => saveClassification(
                                transaction.id,
                                e.target.value || null,
                                { description: transaction.description, amount: transaction.amount, monthYear: processingMonth }
                              )}
                              style={{
                                padding: '0.35rem 0.5rem',
                                borderRadius: '0.375rem',
                                border: classificationWarnings.get(transaction.id)
                                  ? '1px solid #f97316'
                                  : '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                width: '100%',
                                cursor: 'pointer',
                                backgroundColor: classifications.get(transaction.id)
                                  ? categories.find(c => c.id === classifications.get(transaction.id))?.color + '20' || '#fff'
                                  : '#fff',
                              }}
                            >
                              <option value="">לא מסווג</option>
                              {categories
                                .filter((cat) => cat.type === (transaction.amount >= 0 ? 'income' : 'expense'))
                                .map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </option>
                                ))}
                            </select>
                          )}
                        </td>
                        <td>{transaction.activity}</td>
                        <td className={transaction.amount >= 0 ? 'amount-positive' : 'amount-negative'}>
                          {currencyFormatter.format(transaction.amount)}
                        </td>
                        <td>{currencyFormatter.format(transaction.balance)}</td>
                      </tr>
                      {transaction.isCreditCardCharge &&
                       expandedTransaction === transaction.id &&
                       transaction.cardNumber &&
                       creditCardData.has(transaction.cardNumber) && (
                        <tr className="credit-card-details-row">
                          <td colSpan={6}>
                            <div className="credit-card-details">
                              <h4>פירוט תשלומים - כרטיס {transaction.cardNumber}</h4>
                              <table className="credit-card-details-table">
                                <thead>
                                  <tr>
                                    <th>תאריך עסקה</th>
                                    <th>בית עסק</th>
                                    <th>נושא</th>
                                    <th>תשלום</th>
                                    <th>סכום</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {creditCardData.get(transaction.cardNumber)!.payments
                                    .filter((payment) => {
                                      // Filter to show only payments relevant to the analysis month
                                      const transactionMonth = parseMonthFromDateString(payment.transactionDate)
                                      const isInstallment = payment.totalSteps > 1

                                      if (isInstallment) {
                                        // Installment: show if charging month matches
                                        if (payment.chargingDate) {
                                          const chargingMonth = parseMonthFromDateString(payment.chargingDate)
                                          return chargingMonth === processingMonth
                                        }
                                        return false
                                      } else {
                                        // Regular: show if transaction month matches
                                        return transactionMonth === processingMonth
                                      }
                                    })
                                    .map((payment) => (
                                    <tr key={payment.id}>
                                      <td>{payment.transactionDate}</td>
                                      <td>{payment.merchant}</td>
                                      <td>
                                        <select
                                          value={classifications.get(payment.id) || ''}
                                          onChange={(e) => saveClassification(
                                            payment.id,
                                            e.target.value || null,
                                            { description: payment.merchant, amount: -payment.amount, monthYear: processingMonth }
                                          )}
                                          style={{
                                            padding: '0.35rem 0.5rem',
                                            borderRadius: '0.375rem',
                                            border: classificationWarnings.get(payment.id)
                                              ? '1px solid #f97316'
                                              : '1px solid #cbd5e1',
                                            fontSize: '0.85rem',
                                            width: '100%',
                                            cursor: 'pointer',
                                            backgroundColor: classifications.get(payment.id)
                                              ? categories.find(c => c.id === classifications.get(payment.id))?.color + '20' || '#fff'
                                              : '#fff',
                                          }}
                                        >
                                          <option value="">לא מסווג</option>
                                          {categories
                                            .filter((cat) => cat.type === 'expense')
                                            .map((cat) => (
                                              <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                              </option>
                                            ))}
                                        </select>
                                      </td>
                                      <td>{payment.currentStep}/{payment.totalSteps}</td>
                                      <td className="amount-negative">
                                        {currencyFormatter.format(payment.amount)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <FileSelectModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onFileSelect={handleModalFileSelect}
        savedDirHandle={savedDirHandle}
        onDirHandleChange={handleDirHandleChange}
      />

      <YesNoModal
        isOpen={showResetConfirm}
        question="האם אתה בטוח שברצונך למחוק את כל הנתונים?"
        onYes={confirmReset}
        onNo={() => setShowResetConfirm(false)}
      />
    </div>
  )
}
