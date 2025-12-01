import type { Transaction, SheetCell, SheetRow } from '@/app/types/transactions'

export type BankPreview = {
  accountNumber: string | null
  processingMonth: string | null
  transactionCount: number
}

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

/**
 * Parse bank transactions from various Israeli banks.
 * Currently supports FIBI bank format.
 * Future: Add support for Leumi, Discount, etc.
 *
 * @param rows - The sheet rows to parse
 * @param accountNumber - The bank account number (e.g., "123-456789")
 */
export function parseBankTransactions(rows: SheetRow[], accountNumber: string): Transaction[] {
  const sanitized = rows.map((row) => row.map(normalizeCell)) as Array<Array<string | number>>

  // Find header row
  const headerIndex = sanitized.findIndex((row) =>
    row.some((cell) => typeof cell === 'string' && cell.includes('תאריך')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('חובה'))
  )

  if (headerIndex === -1) {
    return []
  }

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
    return []
  }

  const transactions: Transaction[] = []
  const rowsAfterHeader = sanitized.slice(headerIndex + 1)

  // Track index per date for generating IDs
  const dateIndexMap = new Map<string, number>()

  rowsAfterHeader.forEach((row, rowIndex) => {
    const date = row[dateIdx]
    const description = row[descriptionIdx]

    // Skip empty rows or "יתרת חודש קודם"
    if (!date || !description) {
      return
    }

    if (typeof description === 'string' && description.includes('יתרת חודש קודם')) {
      return
    }

    const debit = debitIdx !== -1 ? toNumber(row[debitIdx]) : 0
    const credit = creditIdx !== -1 ? toNumber(row[creditIdx]) : 0
    const amount = debit !== 0 ? -debit : credit
    const balance = balanceIdx !== -1 ? toNumber(row[balanceIdx]) : 0

    // Detect credit card charges
    const descriptionStr = String(description)
    const cardNumberMatch = descriptionStr.match(/(\d{4})\s*-?\s*ישראכרט/)
    const isCreditCard = !!cardNumberMatch
    const cardNumber = cardNumberMatch ? cardNumberMatch[1] : null

    // Generate ID in new format: <account_id>-<date>-<index>
    const dateStr = String(date)
    const currentIndex = (dateIndexMap.get(dateStr) || 0) + 1
    dateIndexMap.set(dateStr, currentIndex)
    const id = `${accountNumber}-${dateStr}-${currentIndex}`

    transactions.push({
      id,
      date: dateStr,
      description: String(description),
      amount,
      type: typeIdx !== -1 ? String(row[typeIdx] || '') : '',
      activity: activityIdx !== -1 ? String(row[activityIdx] || '') : '',
      balance,
      cardNumber,
      isCreditCardCharge: isCreditCard,
    })
  })

  return transactions
}

/**
 * Extract account number from bank transaction file.
 * Looks in the first few rows for account number pattern.
 */
export function extractAccountNumber(rows: SheetRow[]): string | null {
  const sanitized = rows.map((row) => row.map(normalizeCell)) as Array<Array<string | number>>

  for (let i = 0; i < Math.min(4, sanitized.length); i++) {
    for (const cell of sanitized[i]) {
      if (typeof cell === 'string') {
        const accountMatch = cell.match(/(\d{3}-\d{6})/)
        if (accountMatch) {
          return accountMatch[1]
        }
      }
    }
  }
  return null
}

/**
 * Extract preview information from bank transaction file.
 * Returns account number, processing month, and transaction count.
 */
export function extractBankPreview(rows: SheetRow[]): BankPreview {
  // Extract account number from header rows
  const accountNumber = extractAccountNumber(rows)

  // Parse transactions to get count and first transaction date
  // Use a placeholder account number for preview if not found
  const transactions = parseBankTransactions(rows, accountNumber || 'unknown')

  // Extract processing month from first transaction
  let processingMonth: string | null = null
  if (transactions.length > 0) {
    const firstDate = transactions[0].date
    const match = firstDate.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (match) {
      const [, , month, year] = match
      processingMonth = `${month}/${year}`
    }
  }

  return {
    accountNumber,
    processingMonth,
    transactionCount: transactions.length,
  }
}
