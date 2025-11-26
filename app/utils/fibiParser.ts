import type { Transaction } from '@/app/types/transactions'

type SheetCell = string | number | null | undefined
type SheetRow = SheetCell[]

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

export function parseFibiTransactions(rows: SheetRow[]): Transaction[] {
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

    transactions.push({
      id: `${rowIndex}-${date}-${String(description)}-${amount}`,
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

  return transactions
}
