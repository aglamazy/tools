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
  const amountIdx = findIndex('סכום חיוב')
  const detailIdx = findIndex('פירוט')

  if (
    transactionDateIdx === -1 ||
    merchantIdx === -1 ||
    amountIdx === -1 ||
    detailIdx === -1
  ) {
    return { billingDate, cardNumber, payments: [] }
  }

  const payments: CreditCardPayment[] = []
  const rowsAfterHeader = sanitized.slice(headerIndex + 1)

  rowsAfterHeader.forEach((row, rowIndex) => {
    const detailCell = row[detailIdx]
    if (!detailCell || typeof detailCell !== 'string') {
      return
    }

    const match = detailCell.match(/(\d+)\s*מתוך\s*(\d+)/)
    if (!match) {
      return
    }

    const current = parseInt(match[1], 10)
    const total = parseInt(match[2], 10)

    if (!Number.isFinite(current) || !Number.isFinite(total) || current >= total) {
      return
    }

    const amount = toNumber(row[amountIdx])
    if (!Number.isFinite(amount)) {
      return
    }

    payments.push({
      id: `${rowIndex}-${amount}-${current}`,
      transactionDate: String(row[transactionDateIdx] || ''),
      merchant: String(row[merchantIdx] || 'עסקה ללא שם'),
      amount,
      currentStep: current,
      totalSteps: total,
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
  const sanitized = rows.map((row) => row.map(normalizeCell)) as Array<Array<string | number>>

  const cardNumber = extractCardNumber(sanitized)
  const processingMonth = extractProcessingMonth(sanitized)

  // Find header row to count payments
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

  let paymentCount = 0

  if (headerIndex !== -1) {
    const headers = sanitized[headerIndex]
    const detailIdx = headers.findIndex((cell) => typeof cell === 'string' && cell.includes('פירוט'))

    if (detailIdx !== -1) {
      const rowsAfterHeader = sanitized.slice(headerIndex + 1)

      for (const row of rowsAfterHeader) {
        const detailCell = row[detailIdx]
        if (!detailCell || typeof detailCell !== 'string') {
          continue
        }

        const match = detailCell.match(/(\d+)\s*מתוך\s*(\d+)/)
        if (match) {
          const current = parseInt(match[1], 10)
          const total = parseInt(match[2], 10)

          if (Number.isFinite(current) && Number.isFinite(total) && current < total) {
            paymentCount++
          }
        }
      }
    }
  }

  return {
    cardNumber,
    processingMonth,
    paymentCount,
  }
}
