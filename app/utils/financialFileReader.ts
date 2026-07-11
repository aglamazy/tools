import type { SheetRow } from '@/app/types/transactions'
import { readExcelFile } from './excelReader'
import { isPdfFile, readPdfFile, type PdfReadProgress } from './pdfReader'

export type { PdfReadProgress }

/**
 * Read a financial statement file (XLS, XLSX, or PDF) and return rows in the canonical
 * SheetRow[] shape consumed by classifyFile, parseBankWithRegistry, parseCreditWithRegistry.
 *
 * PDFs are extracted server-side via Gemini and synthesized into the same row shape an
 * Excel export would produce. Large PDFs are split into page-range chunks first (#251) —
 * onProgress reports chunk progress for the caller to show a "reading page X/Y" indicator.
 */
export async function readFinancialFile(file: File, onProgress?: (p: PdfReadProgress) => void): Promise<SheetRow[]> {
  if (isPdfFile(file)) {
    return readPdfFile(file, onProgress)
  }
  return readExcelFile(file)
}
