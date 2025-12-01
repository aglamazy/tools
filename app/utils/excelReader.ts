import * as XLSX from 'xlsx'
import type { SheetRow } from '@/app/types/transactions'

/**
 * Centralized Excel file reader.
 * This is the ONLY file in the application that should import xlsx.
 * All other code should use this utility function.
 *
 * SECURITY NOTE:
 * We use the 'xlsx' package despite known vulnerabilities (Prototype Pollution, ReDoS)
 * because:
 * 1. We only process XLS files from trusted sources (bank statements)
 * 2. Alternative libraries (exceljs) don't support old XLS format
 * 3. The bank only provides XLS format, not XLSX
 * 4. Risk is acceptable for this specific use case (local-only, trusted files)
 *
 * This decision should be revisited if:
 * - We start processing files from untrusted sources
 * - The bank starts providing XLSX format
 * - A secure alternative that supports XLS becomes available
 */
export async function readExcelFile(file: File): Promise<SheetRow[]> {
  const arrayBuffer = await file.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
    header: 1,
    raw: false,
  })

  return rows
}
