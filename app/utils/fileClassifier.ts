import type { SheetRow } from '@/app/types/transactions'
import { FileType } from '@/app/types/file-type'

/**
 * Detect the type of financial file based on its content.
 * Analyzes the sheet rows to identify the file format.
 */
export function classifyFile(rows: SheetRow[]): FileType {
  // Normalize cells for analysis
  const sanitized = rows.map((row) =>
    row.map((cell) => {
      if (cell === undefined || cell === null) return ''
      if (typeof cell === 'string') return cell.trim()
      if (typeof cell === 'number') return cell
      return ''
    })
  ) as Array<Array<string | number>>

  // Check for credit card statement (has "סכום חיוב" and "פירוט" columns)
  const hasCreditCardHeaders = sanitized.some((row) =>
    row.some((cell) => typeof cell === 'string' && cell.includes('סכום חיוב')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('פירוט'))
  )

  if (hasCreditCardHeaders) {
    return FileType.CreditCard
  }

  // Check for bank transactions (has "חובה" and "זכות" columns)
  // This pattern works for FIBI and potentially other Israeli banks
  const hasBankHeaders = sanitized.some((row) =>
    row.some((cell) => typeof cell === 'string' && cell.includes('תאריך')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('חובה')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('זכות'))
  )

  if (hasBankHeaders) {
    return FileType.Bank
  }

  return FileType.Unknown
}
