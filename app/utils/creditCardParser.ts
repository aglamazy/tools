import { parseXlsTables } from './xlsTableParser'
import { config } from '@/app/config'
import type { SheetCell, SheetRow } from '@/app/types/transactions'

// Mapping from Hebrew column names to standardized property names
const COLUMN_MAPPINGS = {
  merchant: ['שם בית העסק', 'שם', 'שם העסק', 'בית עסק', 'שם העסק'],
  transactionDate: ['תאריך עסקה', 'תאריך'],
  domesticAmount: ['סכום עסקה'],
  billingAmount: ['סכום חיוב', 'סכום לחיוב'],
  detail: ['פירוט', 'פירוט נוסף'],
  originalAmount: ['סכום מקורי'],
  originalCurrency: ['מטבע מקורי', 'מטבע'],
  billingCurrency: ['מטבע חיוב'],
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

  for (const header of headers) {
    if (!knownColumns.has(header)) {
      unmappedColumns.push(header)
    }
  }

  if (unmappedColumns.length > 0) {
    const message = `⚠️ Unmapped columns detected:\n\n${unmappedColumns.join('\n')}\n\nAdd these to COLUMN_MAPPINGS in creditCardParser.ts`
    console.error(message)
  }
}

/**
 * Gets a value from a row using multiple possible column names
 */
function getRowValue(row: Record<string, any>, possibleNames: string[]): any {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return row[name]
    }
  }
  return null
}

export type CreditCardPayment = {
  id: string
  transactionDate: string
  merchant: string
  amount: number
  currentStep: number
  totalSteps: number
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
    return Number.isFinite(parsed) ? parsed : NaN
  }
  return NaN
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
  // Look for billing date in "חודש החיוב" or "חיוב בתאריך"
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    for (const cell of rows[i]) {
      if (typeof cell === 'string' && (cell.includes('חודש החיוב') || cell.includes('חיוב בתאריך'))) {
        const dateMatch = cell.match(/(\d{2})\/(\d{2})\/(\d{4})/)
        if (dateMatch) {
          const [, day, month, year] = dateMatch
          const parsed = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10))
          if (!Number.isNaN(parsed.getTime())) {
            console.log(`✅ Found billing date: ${day}/${month}/${year} in cell: "${cell}"`)
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
        const match = cell.match(/(\d{4})\s*-\s*ישראכרט/)
        if (match) {
          return match[1]
        }
      }
    }
  }
  return null
}

export function parseCreditCardStatement(rows: SheetRow[]): CreditCardStatement {
  const billingDate = findBillingDate(rows)
  const cardNumber = extractCardNumber(rows)

  // Debug: Show first 20 rows
  console.log('====== RAW ROWS (first 20) ======')
  rows.slice(0, 20).forEach((row, idx) => {
    console.log(`Row ${idx}:`, row)
  })
  console.log('====== END RAW ROWS ======')

  // Use the table parser to detect all sections
  const parsed = parseXlsTables(rows)

  console.log('====== XLS TO JSON DUMP ======')
  console.log(JSON.stringify(parsed, null, 2))
  console.log('====== END DUMP ======')

  console.log('🔍 Credit Card Parser - Detected sections:', parsed.sections.length)
  parsed.sections.forEach((section, idx) => {
    console.log(`Section ${idx}:`)
    console.log(`  tableInfo:`, section.tableInfo)
    console.log(`  headers (${section.headers.length}):`, section.headers)
    console.log(`  rows: ${section.rows.length}`)
    if (section.rows.length > 0) {
      console.log(`  First row sample:`, section.rows[0])
    }
  })

  const payments: CreditCardPayment[] = []
  let globalRowIndex = 0

  // Process each section
  parsed.sections.forEach((section) => {
    // Check for unmapped columns in developer mode
    checkUnmappedColumns(section.headers)

    // Check if this is a foreign currency section
    const isForeign = section.tableInfo.some(info => info.includes('מט"ח') || info.includes('עסקאות במט"ח'))

    console.log(`📊 Processing section: tableInfo=${section.tableInfo.join(', ')}, isForeign=${isForeign}`)

    section.rows.forEach((row, rowIdx) => {
      // Normalize row: extract all known properties
      const normalizedRow: Record<string, any> = {}

      for (const [key, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
        const value = getRowValue(row, possibleNames)
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          normalizedRow[key] = value
        }
      }

      if (config.developerMode && rowIdx === 0) {
        console.log(`  Normalized first row:`, normalizedRow)
      }

      // Validate required fields
      if (!normalizedRow.merchant) {
        if (config.developerMode && rowIdx < 3) {
          console.log(`  Row ${rowIdx}: Skipping - no merchant`)
        }
        return
      }
      if (!normalizedRow.transactionDate) {
        if (config.developerMode && rowIdx < 3) {
          console.log(`  Row ${rowIdx}: Skipping - no transactionDate`)
        }
        return
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

      payments.push({
        id: `${cardNumber || 'unknown'}-${globalRowIndex}-${String(normalizedRow.transactionDate)}-${String(normalizedRow.merchant)}-${amount}-${currentStep}-${totalSteps}`,
        transactionDate: String(normalizedRow.transactionDate),
        merchant: String(normalizedRow.merchant),
        amount,
        currentStep,
        totalSteps,
      })

      globalRowIndex++
    })
  })

  console.log(`✅ Parsed ${payments.length} total payments`)

  return { billingDate, cardNumber, payments }
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
