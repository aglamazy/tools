import { SheetCell, SheetRow } from '@/app/types/transactions'
import type { Parser, ParsedBankResult } from '../types'
import { getCardTypeIndicators } from '@/app/services/appSettingsService'
import { normalizeCell, toNumber, findColumnIndex } from '../shared'

// Mapping from Hebrew column names to standardized property names
const COLUMN_MAPPINGS = {
  date: ['תאריך'],
  description: ['תאור', 'תיאור'],
  debit: ['חובה'],
  credit: ['זכות'],
  reference: ['אסמכתא'],
  activityType: ['סוג פעולה'],
  balance: ['יתרה'],
  valueDate: ['תאריך ערך'],
}

export type ParsedBankTransaction = {
  date: string
  description: string
  amount: number
  balance: number
  accountNumber: string
  cardNumber?: string
  isCreditCardCharge?: boolean
  category?: string
  isFixed?: boolean
}

export type BankPreview = {
  accountNumber: string | null
  processingMonth: string | null
  transactionCount: number
}

/**
 * Parse bank transactions from various Israeli banks.
 * Currently supports FIBI bank format.
 * Future: Add support for Leumi, Discount, etc.
 *
 * @param rows - The sheet rows to parse
 * @param accountNumber - The bank account number (e.g., "123-456789")
 * @param cardTypeIndicators - Card type indicators to match (e.g., ['ישראכרט', 'פרימים אקספרס'])
 */
export function parseBankTransactions(
  rows: SheetRow[],
  accountNumber: string,
  cardTypeIndicators: string[] = ['ישראכרט']
): ParsedBankTransaction[] {
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

  const dateIdx = findColumnIndex(headers, COLUMN_MAPPINGS.date)
  const descriptionIdx = findColumnIndex(headers, COLUMN_MAPPINGS.description)
  const debitIdx = findColumnIndex(headers, COLUMN_MAPPINGS.debit)
  const creditIdx = findColumnIndex(headers, COLUMN_MAPPINGS.credit)
  const typeIdx = findColumnIndex(headers, COLUMN_MAPPINGS.reference)
  const activityIdx = findColumnIndex(headers, COLUMN_MAPPINGS.activityType)
  const balanceIdx = findColumnIndex(headers, COLUMN_MAPPINGS.balance)

  if (dateIdx === -1 || descriptionIdx === -1) {
    return []
  }

  const transactions: ParsedBankTransaction[] = []
  const rowsAfterHeader = sanitized.slice(headerIndex + 1)

  // Track index per date for generating IDs
  const dateIndexMap = new Map<string, number>()

  // Build regex pattern from card type indicators
  const escapedIndicators = cardTypeIndicators.map((ind) => ind.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const cardPatternString = escapedIndicators.join('|')
  const cardPattern = new RegExp(`(\\d{4})?\\s*-?\\s*(${cardPatternString})`)

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
    const descriptionStr = String(description).trim().replace(/\s+/g, ' ');

    const cardNumberMatch = descriptionStr.match(cardPattern)
    const isCreditCard = !!cardNumberMatch
    const cardNumber = cardNumberMatch ? cardNumberMatch[1] : undefined

    // Generate ID in new format: <account_id>-<date>-<index>
    const dateStr = String(date)
    const currentIndex = (dateIndexMap.get(dateStr) || 0) + 1
    dateIndexMap.set(dateStr, currentIndex)
    transactions.push({
      date: dateStr,
      description: String(description),
      amount,
      balance,
      accountNumber,
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
 * Uses provided card indicators or defaults to ['ישראכרט']
 */
export function extractBankPreview(rows: SheetRow[], cardTypeIndicators?: string[]): BankPreview {
  // Extract account number from header rows
  const accountNumber = extractAccountNumber(rows)

  // Parse transactions to get count and first transaction date
  // Use a placeholder account number for preview if not found
  const transactions = parseBankTransactions(rows, accountNumber || 'unknown', cardTypeIndicators)

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

/**
 * Extract preview information from bank transaction file asynchronously.
 * Fetches card type indicators from app settings.
 */
export async function extractBankPreviewAsync(rows: SheetRow[]): Promise<BankPreview> {
  const cardTypeIndicators = await getCardTypeIndicators()
  return extractBankPreview(rows, cardTypeIndicators)
}

const detectFibi = (rows: SheetRow[]): { match: boolean; confidence: number } => {
  const lookAt = rows.slice(0, 8)
  for (const row of lookAt) {
    const asStrings = row.map((c) => (typeof c === 'string' ? c : '')).join(' ')
    const hasDate = asStrings.includes('תאריך')
    const hasDebit = asStrings.includes('חובה')
    if (hasDate && hasDebit) {
      return { match: true, confidence: 0.8 }
    }
  }
  return { match: false, confidence: 0 }
}

export const genericFibiParser: Parser = {
  canParse: (rows: SheetRow[]) => {
    const { match, confidence } = detectFibi(rows)
    return { match, confidence, issuer: 'fibi', kind: 'bank' }
  },
  parse: (rows: SheetRow[], cardTypeIndicators?: string[]): ParsedBankResult => {
    const detection = detectFibi(rows)
    const accountNumber = extractAccountNumber(rows)
    const transactions = parseBankTransactions(rows, accountNumber || 'unknown', cardTypeIndicators)

    // Derive processing month from first transaction if present
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
      kind: 'bank',
      issuer: 'fibi',
      confidence: detection.match ? detection.confidence : 0.2,
      accountNumber,
      processingMonth,
      transactions,
    }
  },
}
