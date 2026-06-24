import { db } from '@/app/db/financeDB'
import type { SheetRow } from '@/app/types/transactions'

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

async function fetchExtraction(file: File): Promise<SheetRow[]> {
  // Claude key is OPTIONAL — if the user set one we use Claude (higher accuracy),
  // otherwise the server falls back to the included Gemini provider. PDF import must
  // work out-of-box on the default setup, so we never block on a missing Claude key.
  const apiKey = await getClaudeApiKey()

  const pdfBase64 = await fileToBase64(file)

  const response = await fetch('/api/extract-pdf-statement', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pdfBase64, ...(apiKey ? { claudeApiKey: apiKey } : {}) }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`PDF extraction failed (${response.status}): ${text || response.statusText}`)
  }

  const json = await response.json()
  if (!Array.isArray(json.rows)) {
    throw new Error('PDF extraction returned no rows')
  }
  return json.rows as SheetRow[]
}

/**
 * Read a PDF financial statement and return SheetRow[] in the same shape as readExcelFile.
 * Posts to /api/extract-pdf-statement, which uses the caller's Claude key when present
 * and otherwise falls back to the included Gemini provider — so import works keyless.
 * Result is cached per (name, size, lastModified) so preview + import share one extraction.
 */
export async function readPdfFile(file: File): Promise<SheetRow[]> {
  const key = cacheKey(file)
  let pending = cache.get(key)
  if (!pending) {
    pending = fetchExtraction(file).catch((err) => {
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
