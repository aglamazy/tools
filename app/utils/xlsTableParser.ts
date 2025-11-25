// Excel table parser - detects tables with headers and converts them to structured JSON

type CellValue = string | number | null | undefined

export type TableSection = {
  tableInfo: string[]
  headers: string[]
  rows: Record<string, CellValue>[]
}

export type ParsedTables = {
  sections: TableSection[]
}

/**
 * Counts non-empty cells in a row
 */
function countNonEmptyCells(row: CellValue[]): number {
  return row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '').length
}

/**
 * Sanitizes a string by removing extra whitespace
 */
function sanitizeString(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
}

/**
 * Converts a row to array of non-empty values
 */
function rowToArray(row: CellValue[]): string[] {
  return row
    .map(cell => sanitizeString(String(cell || '')))
    .filter(val => val !== '')
}

/**
 * Parses Excel rows and detects all tables
 *
 * Logic:
 * 1. Drop empty lines, convert others to arrays
 * 2. Pass over the array:
 *    - size == 1: Create section if needed, add to tableInfo
 *    - size > 1: If no header yet, use as headers. Otherwise, it's table data
 */
export function parseXlsTables(rows: CellValue[][]): ParsedTables {
  const sections: TableSection[] = []
  let currentSection: TableSection | null = null

  for (const row of rows) {
    const size = countNonEmptyCells(row)

    // Skip empty rows
    if (size === 0) {
      continue
    }

    // size == 1: table info
    if (size === 1) {
      // If we have a current section with data, save it and start a new one
      if (currentSection && currentSection.rows.length > 0) {
        sections.push(currentSection)
        currentSection = null
      }

      // Create new section if needed
      if (!currentSection) {
        currentSection = {
          tableInfo: [],
          headers: [],
          rows: [],
        }
      }

      // Add to table info
      const info = rowToArray(row).join(' ')
      currentSection.tableInfo.push(info)
      continue
    }

    // size > 1
    if (size > 1) {
      // Create new section if needed
      if (!currentSection) {
        currentSection = {
          tableInfo: [],
          headers: [],
          rows: [],
        }
      }

      // Don't have headers yet? Use this row as headers
      if (currentSection.headers.length === 0) {
        currentSection.headers = rowToArray(row)
        continue
      }

      // Otherwise: this is table data
      const rowObj: Record<string, CellValue> = {}

      // Find the starting index (some Excel libraries use 0-based, some use 1-based)
      const startIdx = row[0] !== undefined ? 0 : 1

      currentSection.headers.forEach((header, idx) => {
        const value = row[startIdx + idx]
        rowObj[header] = value !== undefined && value !== null && String(value).trim() !== '' ? value : null
      })
      currentSection.rows.push(rowObj)
    }
  }

  // Add the last section if it has data
  if (currentSection && currentSection.rows.length > 0) {
    sections.push(currentSection)
  }

  return { sections }
}
