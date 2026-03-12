import { parseXlsTables } from '../../xlsTableParser'
import { config } from '@/app/config'
import { SheetCell, SheetRow } from '@/app/types/transactions'
import type { Parser, ParsedCreditResult } from '../types'
import { normalizeCell, toNumber, getRowValue } from '../shared'

// Mapping from Hebrew column names to standardized property names
const COLUMN_MAPPINGS = {
  merchant: ['שם בית העסק', 'שם בית עסק', 'שם', 'שם העסק', 'בית עסק', 'שם העסק', 'שם בית מסחר'],
  transactionDate: ['תאריך עסקה', 'תאריך', 'תאריך רכישה', 'תאריך רכישת עסקה'],
  domesticAmount: ['סכום עסקה'],
  billingAmount: ['סכום חיוב', 'סכום לחיוב'],
  detail: ['פירוט', 'פירוט נוסף', 'פירוט נוסף1'],
  originalAmount: ['סכום מקורי'],
  originalCurrency: ['מטבע מקורי', 'מטבע'],
  billingCurrency: ['מטבע חיוב'],
  transactionCurrency: ['מטבע עסקה'],
  voucherNumber: ['מס\' שובר'],
  billingDate: ['תאריך חיוב'],
}

/**
 * Gets all known column names from mappings
 */
function getAllKnownColumns(): Set<string> {
  const known = new Set<string>()
  for (const possibleNames of Object.values(COLUMN_MAPPINGS)) {
    possibleNames.forEach(name => known.add(name))
  }
  return known
}

/**
 * Checks for unmapped columns in developer mode
 */
function checkUnmappedColumns(headers: string[]): void {
  if (!config.developerMode) return

  const knownColumns = getAllKnownColumns()
  const unmappedColumns: string[] = []
  const recognized = headers.filter((h) => knownColumns.has(h))

  // Ignore sections that don't have any recognized columns (likely header/info rows)
  if (recognized.length === 0) return

  for (const header of headers) {
    if (!knownColumns.has(header)) {
      unmappedColumns.push(header)
    }
  }

  if (unmappedColumns.length > 0) {
    const message = `⚠️ Unmapped columns detected:\n\n${unmappedColumns.join('\n')}\n\nAdd these to COLUMN_MAPPINGS in creditCardParser.ts`
    console.warn(message)
  }
}

export type CreditCardPayment = {
  id: string
  transactionDate: string
  merchant: string
  amount: number
  currentStep: number
  totalSteps: number
  totalAmount?: number
}

export type CreditCardStatement = {
  billingDate: Date | null
  cardNumber: string | null
  payments: CreditCardPayment[]
}

export type CreditCardPreview = {
  cardNumber: string | null
  processingMonth: string | null
  paymentCount: number
}

const tryParseDate = (value: SheetCell): Date | null => {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!match) {
    return null
  }

  const day = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10) - 1
  let year = Number.parseInt(match[3], 10)
  if (year < 100) {
    year += 2000
  }

  const parsed = new Date(year, month, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const findBillingDate = (rows: SheetRow[]): Date | null => {
  const hebrewMonths: Record<string, number> = {
    ינואר: 1, פברואר: 2, מרץ: 3, אפריל: 4, מאי: 5, יוני: 6,
    יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
  }

  // Look for billing date in "חודש החיוב" or "חיוב בתאריך"
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    for (const cell of rows[i]) {
      if (typeof cell === 'string' && (cell.includes('חודש החיוב') || cell.includes('חיוב בתאריך'))) {
        const dateMatch = cell.match(/(\d{2})\/(\d{2})\/(\d{4})/)
        if (dateMatch) {
          const [, day, month, year] = dateMatch
          const parsed = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10))
          if (!Number.isNaN(parsed.getTime())) {
            return parsed
          }
        }
      }
    }
  }

  // Look for "אוקטובר 2025" style month+year
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    for (const cell of rows[i]) {
      if (typeof cell !== 'string') continue
      const parts = cell.trim().split(/\s+/)
      if (parts.length === 2) {
        const [monthName, yearStr] = parts
        const month = hebrewMonths[monthName]
        const year = Number.parseInt(yearStr, 10)
        if (month && year && year > 1900 && year < 2100) {
          const parsed = new Date(year, month - 1, 1)
          if (!Number.isNaN(parsed.getTime())) {
            return parsed
          }
        }
      }
    }
  }

  // Fallback: look for any date in header rows
  for (const row of rows) {
    for (const cell of row) {
      const parsed = tryParseDate(cell)
      if (parsed) {
        return parsed
      }
    }
  }
  return null
}

const extractCardNumber = (rows: SheetRow[]): string | null => {
  // Look for card number pattern like "1473 - ישראכרט"
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    for (const cell of rows[i]) {
      if (typeof cell === 'string') {
        const isKnownCardLine = /ישראכרט|כרטיס|ויזה|אמקס|אמריקן|אמריקאן|אמריקן אקספרס|BUSINESS|גולד|זהב/i.test(cell)
        const fourDigitMatches = cell.match(/\b(\d{4})\b/g) || []
        const candidates = fourDigitMatches
          // Avoid years like 2024/2025
          .map((c) => Number(c))
          .filter((n) => !(n >= 2000 && n <= 2035))
          .map((n) => String(n).padStart(4, '0'))

        if (candidates.length > 0 && isKnownCardLine) {
          return candidates[0]
        }

        // Fallback: keep the first non-year 4-digit token we see
        if (candidates.length > 0) {
          return candidates[0]
        }
      }
    }
  }
  return null
}

export function parseCreditCardStatement(rows: SheetRow[]): CreditCardStatement {
  const billingDate = findBillingDate(rows)
  const cardNumber = extractCardNumber(rows)

  // Use the table parser to detect all sections
  const parsed = parseXlsTables(rows)


  const payments: CreditCardPayment[] = []
  let globalRowIndex = 0

  // Process each section
  parsed.sections.forEach((section) => {
    const knownColumns = getAllKnownColumns()
    const recognizedHeaders = section.headers.filter((h) => knownColumns.has(h))

    // Skip sections that don't look like payment tables
    if (recognizedHeaders.length === 0) {
      return
    }

    // Check for unmapped columns in developer mode
    checkUnmappedColumns(section.headers)

    // Check if this is a foreign currency section
    const isForeign = section.tableInfo.some(info => info.includes('מט"ח') || info.includes('עסקאות במט"ח'))

    section.rows.forEach((row, rowIdx) => {
      // Normalize row: extract all known properties
      const normalizedRow: Record<string, any> = {}

      for (const [key, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
        const value = getRowValue(row, possibleNames)
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          normalizedRow[key] = value
        }
      }

      // Always use billing amount (סכום חיוב) - this is the actual charged amount
      // This handles installments, discounts, and foreign currency correctly
      const amount = toNumber(normalizedRow.billingAmount)

      if (!amount || amount === 0) {
        return
      }

      // Parse installment info from detail
      let currentStep = 1
      let totalSteps = 1
      if (normalizedRow.detail && typeof normalizedRow.detail === 'string') {
        const match = normalizedRow.detail.match(/(\d+)\s*מתוך\s*(\d+)/)
        if (match) {
          currentStep = parseInt(match[1], 10)
          totalSteps = parseInt(match[2], 10)
        }
      }

      const merchantName = normalizedRow.merchant ? String(normalizedRow.merchant) : ''
      const detailText = typeof normalizedRow.detail === 'string' ? normalizedRow.detail : ''
      const summaryPatterns = /סה\"?כ|סך הכל|חיובים במט\"ח|סיכום חיובים/i
      const dateText = normalizedRow.transactionDate ? String(normalizedRow.transactionDate) : ''
      const isSummary =
        summaryPatterns.test(merchantName) ||
        summaryPatterns.test(detailText) ||
        summaryPatterns.test(dateText)
      if (isSummary || !normalizedRow.transactionDate) {
        return
      }

      // Calculate totalAmount: use סכום עסקה if available, otherwise totalSteps * amount
      const domesticAmount = toNumber(normalizedRow.domesticAmount)
      const totalAmount = totalSteps > 1
        ? (domesticAmount && domesticAmount !== 0 ? domesticAmount : totalSteps * amount)
        : undefined

      payments.push({
        id: `${cardNumber || 'unknown'}-${globalRowIndex}-${String(normalizedRow.transactionDate)}-${String(normalizedRow.merchant)}-${amount}-${currentStep}-${totalSteps}`,
        transactionDate: String(normalizedRow.transactionDate),
        merchant: merchantName || 'עסקה ללא שם',
        amount,
        currentStep,
        totalSteps,
        totalAmount,
      })

      globalRowIndex++
    })
  })

  return { billingDate, cardNumber, payments }
}

export const genericCreditParser: Parser = {
  canParse: () => ({
    match: true,
    confidence: 0.2,
    issuer: 'generic',
    kind: 'credit',
  }),
  parse: (rows: SheetRow[]): ParsedCreditResult => {
    const statement = parseCreditCardStatement(rows)
    const processingMonth = statement.billingDate
      ? `${String(statement.billingDate.getMonth() + 1).padStart(2, '0')}/${statement.billingDate.getFullYear()}`
      : null

    return {
      kind: 'credit',
      issuer: 'generic',
      confidence: 0.2,
      cardNumber: statement.cardNumber,
      processingMonth,
      statement,
    }
  },
}

const extractProcessingMonth = (rows: Array<Array<string | number>>): string | null => {
  // Look for header row with format "10/11/2025 :חודש החיוב - 1473 :כרטיס"
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    for (const cell of rows[i]) {
      if (typeof cell === 'string' && cell.includes('חודש החיוב')) {
        // Extract date from this cell
        const dateMatch = cell.match(/(\d{2})\/(\d{2})\/(\d{4})/)
        if (dateMatch) {
          const [, , month, year] = dateMatch
          return `${month}/${year}`
        }
      }
    }
  }
  return null
}

export function extractCreditCardPreview(rows: SheetRow[]): CreditCardPreview {
  // Use the main parser and just return the summary info
  const statement = parseCreditCardStatement(rows)

  return {
    cardNumber: statement.cardNumber,
    processingMonth: statement.billingDate
      ? `${String(statement.billingDate.getMonth() + 1).padStart(2, '0')}/${statement.billingDate.getFullYear()}`
      : null,
    paymentCount: statement.payments.length,
  }
}
