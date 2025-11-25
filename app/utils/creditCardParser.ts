type SheetCell = string | number | null | undefined
type SheetRow = SheetCell[]

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

const tryParseDate = (value: string | number): Date | null => {
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

const findBillingDate = (rows: Array<Array<string | number>>): Date | null => {
  // Look for billing date in "חודש החיוב" row
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    for (const cell of rows[i]) {
      if (typeof cell === 'string' && cell.includes('חודש החיוב')) {
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

const extractCardNumber = (rows: Array<Array<string | number>>): string | null => {
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
  const sanitized = rows.map((row) => row.map(normalizeCell)) as Array<Array<string | number>>
  const billingDate = findBillingDate(sanitized)
  const cardNumber = extractCardNumber(sanitized)

  const headerIndex = sanitized.findIndex((row) =>
    row.some(
      (cell) =>
        typeof cell === 'string' &&
        cell.includes('סכום חיוב') &&
        row.some(
          (innerCell) => typeof innerCell === 'string' && innerCell.includes('פירוט'),
        ),
    ),
  )

  if (headerIndex === -1) {
    return { billingDate, cardNumber, payments: [] }
  }

  const headers = sanitized[headerIndex]
  const findIndex = (text: string) =>
    headers.findIndex((cell) => typeof cell === 'string' && cell.includes(text))

  const transactionDateIdx = findIndex('תאריך')
  const merchantIdx = findIndex('שם')
  const domesticAmountIdx = findIndex('סכום עסקה')
  const billingAmountIdx = findIndex('סכום חיוב')
  const detailIdx = findIndex('פירוט')

  console.log('🔍 Credit Card Parser Debug:')
  console.log('Header row:', headers)
  console.log('Indices:', { transactionDateIdx, merchantIdx, domesticAmountIdx, billingAmountIdx, detailIdx })

  if (merchantIdx === -1) {
    console.log('❌ Missing merchant column')
    return { billingDate, cardNumber, payments: [] }
  }

  const payments: CreditCardPayment[] = []
  const rowsAfterHeader = sanitized.slice(headerIndex + 1)

  rowsAfterHeader.forEach((row, rowIndex) => {
    const merchant = row[merchantIdx]
    const domesticAmount = domesticAmountIdx !== -1 ? row[domesticAmountIdx] : null
    const billingAmount = billingAmountIdx !== -1 ? row[billingAmountIdx] : null

    // Valid transaction must have merchant name
    if (!merchant || String(merchant).trim() === '') {
      return
    }

    // Determine which amount to use
    let amount = 0
    const domesticNum = domesticAmount !== null && domesticAmount !== '' ? toNumber(domesticAmount) : NaN
    const billingNum = billingAmount !== null && billingAmount !== '' ? toNumber(billingAmount) : NaN

    // Domestic transaction: has valid סכום עסקה
    if (Number.isFinite(domesticNum) && domesticNum !== 0) {
      amount = domesticNum
    }
    // Foreign transaction: has valid סכום חיוב but no valid סכום עסקה
    else if (Number.isFinite(billingNum) && billingNum !== 0) {
      amount = billingNum
    }
    // Skip if no valid amount
    else {
      return
    }

    const transactionDate = row[transactionDateIdx]
    if (!transactionDate) {
      return
    }

    const detailCell = row[detailIdx]
    let currentStep = 1
    let totalSteps = 1

    // Check if this is an installment payment
    if (detailCell && typeof detailCell === 'string') {
      const match = detailCell.match(/(\d+)\s*מתוך\s*(\d+)/)
      if (match) {
        const current = parseInt(match[1], 10)
        const total = parseInt(match[2], 10)
        if (Number.isFinite(current) && Number.isFinite(total)) {
          currentStep = current
          totalSteps = total
        }
      }
    }

    payments.push({
      id: `${cardNumber || 'unknown'}-${String(transactionDate)}-${String(merchant)}-${amount}-${currentStep}-${totalSteps}`,
      transactionDate: String(transactionDate),
      merchant: String(merchant),
      amount,
      currentStep,
      totalSteps,
    })
  })

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
