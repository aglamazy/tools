// Shared between app/api/extract-pdf-statement/route.ts (server) and
// app/utils/pdfReader.ts (client, for multi-chunk merging) — pure data
// transformation, safe to import from either side.

export type ExtractedRow = {
  date?: string | null
  merchant?: string | null
  description?: string | null
  txAmount?: number | null
  billAmount?: number | null
  debit?: number | null
  credit?: number | null
  balance?: number | null
  reference?: string | null
  detail?: string | null
}

export type Extraction = {
  kind: 'bank' | 'credit'
  accountNumber?: string | null
  cardNumber?: string | null
  billingDate?: string | null
  processingMonth?: string | null
  rows: ExtractedRow[]
}

/**
 * Build a SheetRow[] (array of cell arrays) that mirrors the shape produced by readExcelFile.
 * Headers and identifying rows match what an XLSX export from FIBI / Otsar HaHayal would contain,
 * so the existing fileClassifier + bank/credit parsers consume the rows without modification.
 */
export function toSheetRows(e: Extraction): Array<Array<string | number | null>> {
  if (e.kind === 'credit') {
    return creditRows(e)
  }
  return bankRows(e)
}

function creditRows(e: Extraction): Array<Array<string | number | null>> {
  const rows: Array<Array<string | number | null>> = []
  const card = e.cardNumber ?? ''
  const billing = e.billingDate ?? ''
  if (card || billing) {
    rows.push([`כרטיס:${card} - ישראכרט חודש החיוב: ${billing}`])
  }
  if (billing) {
    rows.push([`עסקאות בשקלים חיוב בתאריך ${billing}`])
  }
  rows.push(['תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'סכום חיוב', 'פירוט'])
  for (const r of e.rows) {
    if (!r.date) continue
    rows.push([
      r.date,
      r.merchant ?? '',
      r.txAmount ?? r.billAmount ?? 0,
      r.billAmount ?? r.txAmount ?? 0,
      r.detail ?? '',
    ])
  }
  return rows
}

function bankRows(e: Extraction): Array<Array<string | number | null>> {
  const rows: Array<Array<string | number | null>> = []
  const acct = e.accountNumber ?? ''
  const month = e.processingMonth ?? ''
  if (acct) rows.push([`חשבון ${acct}`])
  if (month) rows.push([`חודש: ${month}`])
  rows.push(['תאריך', 'תאריך ערך', 'תיאור', 'אסמכתא', 'חובה', 'זכות', 'יתרה'])
  for (const r of e.rows) {
    if (!r.date) continue
    rows.push([
      r.date,
      '',
      r.description ?? '',
      r.reference ?? '',
      r.debit ?? 0,
      r.credit ?? 0,
      r.balance ?? null,
    ])
  }
  return rows
}

/**
 * Merge multiple chunk extractions (one PDF split across N page-range calls)
 * into a single Extraction — concatenates rows in chunk order, and takes the
 * first non-null value found for account/card/billing/month metadata (the
 * statement header usually only prints on the first page's chunk).
 */
export function mergeExtractions(chunks: Extraction[]): Extraction {
  if (chunks.length === 0) throw new Error('mergeExtractions: no chunks')
  const kind = chunks[0].kind
  const firstNonNull = <K extends keyof Extraction>(key: K): Extraction[K] | undefined => {
    for (const c of chunks) {
      if (c[key] != null) return c[key]
    }
    return undefined
  }
  return {
    kind,
    accountNumber: firstNonNull('accountNumber') ?? null,
    cardNumber: firstNonNull('cardNumber') ?? null,
    billingDate: firstNonNull('billingDate') ?? null,
    processingMonth: firstNonNull('processingMonth') ?? null,
    rows: chunks.flatMap((c) => c.rows),
  }
}

/**
 * A real transaction row can never have a zero amount on both sides — that
 * shape only happens when the model's response was truncated or otherwise
 * degenerate. Shared so both the API route and the client (per-chunk, before
 * merging) can apply the identical check.
 */
export function findZeroAmountRows(extraction: Extraction): ExtractedRow[] {
  return extraction.kind === 'credit'
    ? extraction.rows.filter((r) => !!r.date && !r.txAmount && !r.billAmount)
    : extraction.rows.filter((r) => !!r.date && !r.debit && !r.credit)
}
