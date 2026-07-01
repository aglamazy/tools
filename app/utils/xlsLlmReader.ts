import type { XlsExtraction } from '@/app/types/xlsExtraction'

export type { XlsExtraction, XlsNormalizedTransaction } from '@/app/types/xlsExtraction'

const cache = new Map<string, Promise<XlsExtraction>>()

function cacheKey(file: File) {
  return `xls:${file.name}|${file.size}|${file.lastModified}`
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

async function fetchExtraction(file: File): Promise<XlsExtraction> {
  const xlsBase64 = await fileToBase64(file)

  const response = await fetch('/api/extract-xls-statement', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xlsBase64 }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`XLS LLM extraction failed (${response.status}): ${text || response.statusText}`)
  }

  const json = await response.json()
  if (!json.kind || !Array.isArray(json.transactions)) {
    throw new Error('XLS LLM extraction returned invalid data')
  }
  return json as XlsExtraction
}

/**
 * Send an XLS/XLSX file to the LLM extraction endpoint and return normalized structured
 * transactions. Result is cached per (name, size, lastModified) so preview + import share
 * one extraction round-trip.
 *
 * Returns an XlsExtraction with `kind`, normalized transactions (YYYY-MM-DD dates,
 * collapsed-whitespace descriptions), and metadata (accountNumber / cardNumber /
 * billingDate / processingMonth).
 */
export async function readXlsWithLLM(file: File): Promise<XlsExtraction> {
  const key = cacheKey(file)
  let pending = cache.get(key)
  if (!pending) {
    pending = fetchExtraction(file).catch((err) => {
      cache.delete(key)
      throw err
    })
    cache.set(key, pending)
  }
  return pending
}

export function isXlsFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.xls') || name.endsWith('.xlsx')
}
