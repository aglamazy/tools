import type { Transaction } from '@/app/db/financeDB'

export type GapRange = {
  startDate: string // last date covered before the hole
  endDate: string // first date covered after the hole
}

// A hole must be at least this many days to flag — importers don't always
// capture the exact boundary day, so a 1-day seam between two files isn't
// a real gap.
const GAP_DAY_THRESHOLD = 2

// Transaction.date is NOT consistently one format: parser-imported rows
// (bank/credit) are normalized to ISO YYYY-MM-DD (parsers/shared.ts
// normalizeDate), but manually-entered cash rows use DD/MM/YYYY.
function parseAnyDate(d: string): Date {
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const slash = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]))
  return new Date(d)
}

function compareTxDates(a: string, b: string): number {
  return parseAnyDate(a).getTime() - parseAnyDate(b).getTime()
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseAnyDate(b).getTime() - parseAnyDate(a).getTime()) / 86400000)
}

type FileSpan = { minDate: string; maxDate: string }

// Some filenames encode the requested statement range, e.g.
// "report__2026-04-01__2026-05-08.xlsx" — this is the file's DECLARED
// validity, and it's routinely wider than its actual transactions (a bank
// page requested through May 1 with no activity after Apr 20 still proves
// Apr 21-30 has no missing data, it just had no activity). Confirmed on
// real data: every report__ file's last transaction trails its declared end
// by several days. Use the declared range as the authoritative span when
// present — it's strictly better evidence than "last row we happened to see".
function extractDeclaredRange(fileId: string): { start: string; end: string } | null {
  const m = fileId.match(/(\d{4}-\d{2}-\d{2})__(\d{4}-\d{2}-\d{2})/)
  return m ? { start: m[1], end: m[2] } : null
}

/**
 * Per-file coverage span: the file's declared range when its name encodes
 * one, widened (never narrowed) by its actual transaction min/max in case
 * the declared range is somehow smaller than what it really contains.
 * Falls back to actual transaction min/max alone when no declared range is
 * available (e.g. "FibiSave12345.xls", "211362-June.pdf").
 */
function computeFileSpans(rows: Transaction[]): FileSpan[] {
  const byFile = new Map<string, FileSpan>()
  for (const t of rows) {
    if (!t.fileId) continue
    const existing = byFile.get(t.fileId)
    if (!existing) {
      byFile.set(t.fileId, { minDate: t.date, maxDate: t.date })
    } else {
      if (compareTxDates(t.date, existing.minDate) < 0) existing.minDate = t.date
      if (compareTxDates(t.date, existing.maxDate) > 0) existing.maxDate = t.date
    }
  }

  for (const [fileId, span] of byFile) {
    const declared = extractDeclaredRange(fileId)
    if (!declared) continue
    if (compareTxDates(declared.start, span.minDate) < 0) span.minDate = declared.start
    if (compareTxDates(declared.end, span.maxDate) > 0) span.maxDate = declared.end
  }

  return Array.from(byFile.values())
}

/**
 * Union the file-coverage spans (sorted, merging overlaps) and report any
 * hole between consecutive merged spans wider than the threshold. Nothing
 * before the first span or after the last is a "gap" — that's just not
 * imported yet, a separate concept from a hole between two imports.
 */
function findTimelineGaps(spans: FileSpan[]): GapRange[] {
  if (spans.length === 0) return []
  const sorted = spans.slice().sort((a, b) => compareTxDates(a.minDate, b.minDate))

  const gaps: GapRange[] = []
  let coveredUntil = sorted[0].maxDate

  for (let i = 1; i < sorted.length; i++) {
    const span = sorted[i]
    if (compareTxDates(span.minDate, coveredUntil) <= 0) {
      // Overlaps or touches the current merged span — just extend it.
      if (compareTxDates(span.maxDate, coveredUntil) > 0) coveredUntil = span.maxDate
      continue
    }
    const gapDays = daysBetween(coveredUntil, span.minDate)
    if (gapDays > GAP_DAY_THRESHOLD) {
      gaps.push({ startDate: coveredUntil, endDate: span.minDate })
    }
    coveredUntil = span.maxDate
  }

  return gaps
}

export function findBankGaps(transactions: Transaction[], accountNumber: string): GapRange[] {
  const rows = transactions.filter((t) => t.type === 'bank' && t.accountNumber === accountNumber)
  return findTimelineGaps(computeFileSpans(rows))
}

export function findCreditGaps(transactions: Transaction[], cardNumber: string): GapRange[] {
  const rows = transactions.filter((t) => t.type === 'credit' && t.cardNumber === cardNumber)
  return findTimelineGaps(computeFileSpans(rows))
}
