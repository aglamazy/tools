// Shared between app/api/extract-pdf-statement/route.ts (server) and
// app/utils/pdfReader.ts (client, for multi-chunk merging) — pure data
// transformation, safe to import from either side.

export type ExtractedRow = {
  date?: string | null
  merchant?: string | null
  description?: string | null
  txAmount?: number | null
  billAmount?: number | null
  currency?: string | null
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
  // Every "סה"כ חיוב לתאריך" figure printed on the page(s) — the statement's
  // own totals, used to reconcile the extracted rows (aglamazo#452).
  statementTotals?: number[] | null
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

    // aglamazo#372: a foreign-currency row (currency != ILS/₪) with no
    // billAmount has no real NIS figure anywhere in the source document —
    // it's a not-yet-settled charge ("עסקאות שטרם נקלטו"), which Israeli
    // card issuers print with ONLY the foreign amount until it clears next
    // billing cycle. Silently writing txAmount into the "סכום חיוב" column
    // (the old `r.billAmount ?? r.txAmount ?? 0` fallback) turned a $200
    // charge into a recorded ₪200 charge — understating it by ~2.5-3x. Per
    // the project's no-silent-fallback rule: exclude the row instead of
    // guessing. It will be captured correctly once it appears settled in a
    // later statement.
    const isForeign = !!r.currency && !/^(ils|₪|שח|ש"ח|שקל)/i.test(r.currency.trim())
    if (r.billAmount == null && isForeign) {
      continue
    }

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
    statementTotals: chunks.flatMap((c) => c.statementTotals ?? []),
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

/**
 * A credit row with no NIS billAmount AND no currency is ambiguous: creditRows()
 * would store its txAmount, which on a foreign-purchase row is the ORIGINAL
 * amount (aglamazo#452: ALL 4,400 stored as ₪4,400 instead of ₪167.45).
 */
export function findAmbiguousCreditRows(extraction: Extraction): ExtractedRow[] {
  if (extraction.kind !== 'credit') return []
  return extraction.rows.filter((r) => !!r.date && r.billAmount == null && !r.currency?.trim())
}

/**
 * Reconcile a merged credit extraction against the statement's own printed
 * totals ("סה"כ חיוב לתאריך"). Returns null when they agree (within 1 agora per
 * row of rounding) or when the statement printed no total; otherwise a Hebrew
 * error naming both figures. A short read (aglamazo#452: 4 of ~93 rows) or a
 * foreign amount taken as NIS can never pass this.
 */
export function reconcileCreditTotals(extraction: Extraction): string | null {
  if (extraction.kind !== 'credit') return null
  const totals = extraction.statementTotals ?? []
  if (totals.length === 0) return null
  const expected = round2(totals.reduce((a, t) => a + t, 0))
  const sheet = creditRows(extraction)
  const headerIdx = sheet.findIndex((r) => r[0] === 'תאריך עסקה')
  const actual = round2(
    sheet.slice(headerIdx + 1).reduce((a, r) => a + (typeof r[3] === 'number' ? r[3] : 0), 0),
  )
  if (Math.abs(actual - expected) <= 0.01) return null
  return `סכום השורות שחולצו (${actual.toFixed(2)}) שונה מסה"כ החיוב בדוח (${expected.toFixed(2)}) — הקובץ לא יובא. נסה שוב.`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
