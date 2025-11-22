'use client'

import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import type { SheetRow, Transaction, ParseResult } from '@/app/types/transactions'
import FileSelectModal from './FileSelectModal'
import { parseCreditCardStatement } from '@/app/utils/creditCardParser'

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
      id: `${rowIndex}-${date}-${amount}`,
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

        // If this is an additional file, validate it's from the same month
        if (isAdditional && processingMonth) {
          if (result.processingMonth !== processingMonth) {
            setError(`הקובץ הזה משייך לחודש ${result.processingMonth} אבל אתה מנתח ${processingMonth}. אנא בחר קובץ מאותו חודש.`)
            return
          }
        }

        // If this is a credit card file, store the credit card data
        const statement = fileType === 'credit-card' ? parseCreditCardStatement(rows) : null
        if (statement && statement.cardNumber) {
          setCreditCardData((prev) => {
            const newMap = new Map(prev)
            newMap.set(statement.cardNumber!, {
              cardNumber: statement.cardNumber!,
              payments: statement.payments,
            })
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
            // Merge with existing transactions
            setTransactions((prev) => [...prev, ...result.transactions])
            setLoadedFiles((prev) => [...prev, file.name])
          } else {
            // Replace transactions
            setTransactions(result.transactions)
            setProcessingMonth(result.processingMonth)
            setLoadedFiles([file.name])
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
    setLoadedFiles([])
    setTransactions([])
    setProcessingMonth(null)
    setError('')
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
                          <td colSpan={5}>
                            <div className="credit-card-details">
                              <h4>פירוט תשלומים - כרטיס {transaction.cardNumber}</h4>
                              <table className="credit-card-details-table">
                                <thead>
                                  <tr>
                                    <th>תאריך עסקה</th>
                                    <th>בית עסק</th>
                                    <th>תשלום</th>
                                    <th>סכום</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {creditCardData.get(transaction.cardNumber)!.payments.map((payment) => (
                                    <tr key={payment.id}>
                                      <td>{payment.transactionDate}</td>
                                      <td>{payment.merchant}</td>
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
        onDirHandleChange={setSavedDirHandle}
      />
    </div>
  )
}
