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

// A single Gemini call occasionally hallucinates an all-zero page even at
// temperature 0 — observed on page 1/6 of a real statement across repeated
// runs of the exact same input: pass, fail, fail-twice-in-a-row. Page 1 is
// also the densest layout (blank-balance rows, wrapped two-line
// descriptions), so it's the most failure-prone chunk. 3 attempts absorbs
// that without forcing the user to re-upload the whole file for one bad page.
const MAX_CHUNK_ATTEMPTS = 3

/**
 * Extract one chunk, retrying up to MAX_CHUNK_ATTEMPTS on failure. A missing
 * chunk means missing days of transactions — the same silent-data-loss shape
 * we're preventing (#251/#252) — so we fail hard if every attempt fails.
 */
async function extractChunkWithRetry(
  chunk: File,
  opts: { hint?: 'bank' | 'credit'; exampleContext?: string },
  label: string,
): Promise<Extraction & { rawRows: Extraction['rows'] }> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
    try {
      return await fetchExtractionChunk(chunk, opts)
    } catch (err) {
      lastErr = err
      console.error(`[pdfReader] ${label} attempt ${attempt} failed:`, err)
    }
  }
  throw lastErr
}

async function fetchExtraction(file: File, onProgress?: (p: PdfReadProgress) => void): Promise<SheetRow[]> {
  const chunks = await splitPdfIntoChunks(file)
  const total = chunks.length

  // Page 1 carries the only column-header row in an Israeli statement export
  // (#251) — continuation pages print none. So extract it FIRST, sequentially:
  // it establishes the doc kind and, from its own real extraction, a few-shot
  // "worked example" that tells every later page the debit/credit/balance
  // column mapping. Only then can the rest run.
  let done = 0
  const bump = () => onProgress?.({ current: ++done, total })

  const first = await extractChunkWithRetry(chunks[0], {}, `chunk 1/${total}`)
  bump()
  const hint = first.kind
  const exampleContext = buildExampleContext(first)

  // The remaining pages are independent of each other — each only needs page
  // 1's example, not the page before it. So fan them out in PARALLEL instead
  // of walking them one-by-one: a 6-page file goes from ~6 sequential calls
  // (~3.5min) to ~2 call-times (~60-80s). Each still retries independently;
  // if any page fails all attempts, the whole import fails (no silent gaps).
  const rest = await Promise.all(
    chunks.slice(1).map((chunk, i) =>
      extractChunkWithRetry(chunk, { hint, exampleContext }, `chunk ${i + 2}/${total}`).then((r) => {
        bump()
        return r
      }),
    ),
  )

  const merged = mergeExtractions([first, ...rest])

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
