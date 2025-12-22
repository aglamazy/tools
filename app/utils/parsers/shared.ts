import { SheetCell } from '@/app/types/transactions'

/**
 * Normalize a cell value to string or number
 */
export const normalizeCell = (value: SheetCell): string | number => {
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

/**
 * Convert a value to number
 */
export const toNumber = (value: string | number): number => {
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
 * Gets a column index from headers using multiple possible names
 */
export function findColumnIndex(headers: Array<string | number>, possibleNames: string[]): number {
  for (const name of possibleNames) {
    const index = headers.findIndex((cell) => typeof cell === 'string' && cell.includes(name))
    if (index !== -1) {
      return index
    }
  }
  return -1
}

/**
 * Gets a value from a row using multiple possible column names
 */
export function getRowValue(row: Record<string, any>, possibleNames: string[]): any {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return row[name]
    }
  }
  return null
}
