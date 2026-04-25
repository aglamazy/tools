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
 * Normalize an amount to a number rounded to 2 decimals.
 * Uses toNumber for parsing, then `Math.round(n * 100) / 100` to avoid float drift.
 * Returns 0 for NaN / non-finite values.
 */
export function normalizeAmount(v: unknown): number {
  let n: number
  if (typeof v === 'number') {
    n = v
  } else if (typeof v === 'string') {
    n = toNumber(v)
  } else if (v === null || v === undefined) {
    return 0
  } else {
    // Best-effort coercion for other types
    n = toNumber(String(v))
  }
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * Normalize a date string into canonical YYYY-MM-DD form.
 * Accepts:
 *   - DD/MM/YYYY
 *   - DD.MM.YYYY
 *   - DD.MM.YY (assumes 20YY)
 *   - YYYY-MM-DD (already canonical)
 * Returns undefined for empty input. Unknown formats are returned
 * as-is with a console.warn so we don't silently lose data.
 */
export function normalizeDate(input: string | undefined | null): string | undefined {
  if (input === undefined || input === null) return undefined
  const s = String(input).trim()
  if (s === '') return undefined

  // Already canonical YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return s
  }

  // DD/MM/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, d, m, y] = slashMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // DD.MM.YYYY or DD.MM.YY
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)
  if (dotMatch) {
    const [, d, m, yRaw] = dotMatch
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  console.warn(`[normalizeDate] Unknown date format, returning as-is: "${s}"`)
  return s
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
