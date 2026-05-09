import type { SheetRow } from '@/app/types/transactions'
import { readExcelFile } from './excelReader'
import { isPdfFile, readPdfFile } from './pdfReader'

/**
 * Read a financial statement file (XLS, XLSX, or PDF) and return rows in the canonical
 * SheetRow[] shape consumed by classifyFile, parseBankWithRegistry, parseCreditWithRegistry.
 *
 * PDFs are extracted via Claude (server-side, using the user's stored API key) and
 * synthesized into the same row shape an Excel export would produce.
 */
export async function readFinancialFile(file: File): Promise<SheetRow[]> {
  if (isPdfFile(file)) {
    return readPdfFile(file)
  }
  return readExcelFile(file)
}
