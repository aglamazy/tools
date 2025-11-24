import * as XLSX from 'xlsx'
import { extractCreditCardPreview } from './creditCardParser'

type SheetRow = Array<string | number | null | undefined>

const normalizeCell = (value: string | number | null | undefined): string | number => {
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

const parseTransactionDate = (dateStr: string): { month: string; year: string } | null => {
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

export type FileMetadata = {
  fileType: 'bank' | 'credit-card' | 'unknown'
  processingMonth?: string
  accountNumber?: string
  cardNumber?: string
  transactionCount: number
}

export const extractFileMetadata = async (file: File): Promise<FileMetadata> => {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    const workbook = XLSX.read(data, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
      header: 1,
      raw: false,
    })

    const sanitized = rows.map((row) => row.map(normalizeCell)) as Array<Array<string | number>>
    const fileType = detectFileType(sanitized)

    if (fileType === 'credit-card') {
      const creditPreview = extractCreditCardPreview(rows)
      return {
        fileType: 'credit-card',
        processingMonth: creditPreview.processingMonth || undefined,
        cardNumber: creditPreview.cardNumber || undefined,
        transactionCount: creditPreview.paymentCount,
      }
    }

    if (fileType === 'fibi-transactions') {
      // Extract account number from header rows
      let accountNumber: string | undefined

      for (let i = 0; i < Math.min(4, sanitized.length); i++) {
        for (const cell of sanitized[i]) {
          if (typeof cell === 'string') {
            const accountMatch = cell.match(/(\d{3}-\d{6})/)
            if (accountMatch && !accountNumber) {
              accountNumber = accountMatch[1]
            }
          }
        }
      }

      // Find header row and get first transaction date
      const headerIndex = sanitized.findIndex((row) =>
        row.some((cell) => typeof cell === 'string' && cell.includes('תאריך')) &&
        row.some((cell) => typeof cell === 'string' && cell.includes('חובה'))
      )

      let transactionCount = 0
      let processingMonth: string | undefined

      if (headerIndex !== -1) {
        const rowsAfterHeader = sanitized.slice(headerIndex + 1)
        const headers = sanitized[headerIndex]
        const dateIdx = headers.findIndex((cell) => typeof cell === 'string' && cell.includes('תאריך'))
        const descriptionIdx = headers.findIndex((cell) => typeof cell === 'string' && cell.includes('תיאור'))

        if (dateIdx !== -1 && descriptionIdx !== -1) {
          const validTransactions = rowsAfterHeader.filter((row) => {
            const date = row[dateIdx]
            const description = row[descriptionIdx]
            if (!date || !description) return false
            if (typeof description === 'string' && description.includes('יתרת חודש קודם')) return false
            return true
          })

          transactionCount = validTransactions.length

          if (validTransactions.length > 0) {
            const firstDate = validTransactions[0][dateIdx]
            const parsedDate = parseTransactionDate(String(firstDate))
            if (parsedDate) {
              processingMonth = `${parsedDate.month}/${parsedDate.year}`
            }
          }
        }
      }

      return {
        fileType: 'bank',
        processingMonth,
        accountNumber,
        transactionCount,
      }
    }

    return {
      fileType: 'unknown',
      transactionCount: 0,
    }
  } catch (err) {
    console.error('Error extracting file metadata:', err)
    return {
      fileType: 'unknown',
      transactionCount: 0,
    }
  }
}
