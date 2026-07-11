import { db } from '@/app/db/financeDB'
import type { SheetRow } from '@/app/types/transactions'
import { splitPdfIntoChunks } from './pdfSplitter'
import { toSheetRows, mergeExtractions, findZeroAmountRows, type Extraction } from './pdfExtractionRows'

export type PdfReadProgress = { current: number; total: number }

const cache = new Map<string, Promise<SheetRow[]>>()

function cacheKey(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

async function getClaudeApiKey(): Promise<string | null> {
  const row = await db.appSettings.where('key').equals('claudeApiKey').first()
  const value = (row?.value as string | undefined)?.trim()
  return value || null
}

// Sample rows to carry forward as a few-shot example for continuation
// chunks — enough to demonstrate both debit and credit rows, not so many
// that it costs meaningful tokens.
const EXAMPLE_ROW_COUNT = 4

function buildExampleContext(extraction: Extraction): string {
  return JSON.stringify({
    accountNumber: extraction.accountNumber,
    cardNumber: extraction.cardNumber,
    processingMonth: extraction.processingMonth,
    sampleRows: extraction.rows.slice(0, EXAMPLE_ROW_COUNT),
  })
}

/** POST a single PDF (or page-range chunk) to the extraction endpoint and return its raw extraction. */
async function fetchExtractionChunk(
  file: File,
  opts: { hint?: 'bank' | 'credit'; exampleContext?: string },
): Promise<Extraction & { rawRows: Extraction['rows'] }> {
  const apiKey = await getClaudeApiKey()
  const pdfBase64 = await fileToBase64(file)

  const response = await fetch('/api/extract-pdf-statement', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pdfBase64,
      ...(apiKey ? { claudeApiKey: apiKey } : {}),
      ...(opts.hint ? { hint: opts.hint } : {}),
      ...(opts.exampleContext ? { exampleContext: opts.exampleContext } : {}),
    }),
  })

  if (!response.ok) {
    const json = await response.json().catch(() => null)
    const message = json?.error || response.statusText
    throw new Error(`PDF extraction failed (${response.status}): ${message}`)
  }

  const json = await response.json()
  if (!Array.isArray(json.rawRows)) {
    throw new Error('PDF extraction returned no rows')
  }
  return {
    kind: json.kind,
    accountNumber: json.accountNumber,
    cardNumber: json.cardNumber,
    billingDate: json.billingDate,
    processingMonth: json.processingMonth,
    rows: json.rawRows,
    rawRows: json.rawRows,
  }
}

async function fetchExtraction(file: File, onProgress?: (p: PdfReadProgress) => void): Promise<SheetRow[]> {
  const chunks = await splitPdfIntoChunks(file)

  const extractions: Extraction[] = []
  let hint: 'bank' | 'credit' | undefined
  let exampleContext: string | undefined
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ current: i + 1, total: chunks.length })
    // Fail the whole import if any chunk fails — a missing chunk means
    // missing days of transactions, which is the same silent-data-loss
    // shape we're trying to prevent (#251/#252). Sequential (not parallel)
    // so progress is meaningful, each chunk can use the previous chunk's
    // real result as its few-shot example, and we don't hammer the rate limit.
    const extraction = await fetchExtractionChunk(chunks[i], { hint, exampleContext })
    if (!hint) hint = extraction.kind
    // Continuation pages print no column headers of their own (#251) — carry
    // the first successful chunk's real extraction forward as a worked
    // example so every later chunk knows the debit/credit/balance mapping
    // without re-sending the header page's image on every call.
    if (!exampleContext) exampleContext = buildExampleContext(extraction)
    extractions.push(extraction)
  }

  const merged = mergeExtractions(extractions)

  // Server already validates each chunk individually before returning it —
  // this is a cheap final sanity check on the merged result, not a
  // duplicate of real work.
  const zeroAmountRows = findZeroAmountRows(merged)
  if (zeroAmountRows.length > 0) {
    throw new Error(`חילוץ ה-PDF הניב ${zeroAmountRows.length} שורות עם סכום 0 לאחר המיזוג — נסה שוב.`)
  }

  return toSheetRows(merged)
}

/**
 * Read a PDF financial statement and return SheetRow[] in the same shape as readExcelFile.
 * Large PDFs are split into page-range chunks (#251) and extracted sequentially, each
 * validated server-side (#252) before being merged — no zero-amount rows ever reach the caller.
 * Result is cached per (name, size, lastModified) so preview + import share one extraction.
 */
export async function readPdfFile(file: File, onProgress?: (p: PdfReadProgress) => void): Promise<SheetRow[]> {
  const key = cacheKey(file)
  let pending = cache.get(key)
  if (!pending) {
    pending = fetchExtraction(file, onProgress).catch((err) => {
      // Don't keep failed promises in the cache — let the next caller retry.
      cache.delete(key)
      throw err
    })
    cache.set(key, pending)
  }
  return pending
}

export function isPdfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
}
