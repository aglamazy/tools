// Some expense-doc extractions (before the fix in d6ade86) returned the document's
// TYPE/title ("חשבונית מס 50095", "Invoice") as `description` instead of the actual
// line item. Those values are truthy but uninformative, so they'd otherwise win over
// a correct `vendor` in a naive `description || vendor` fallback chain. Matches ONLY
// a string that is entirely a doc-type word + optional number (never a real, longer
// description that merely starts with "קבלה"/"חשבונית", e.g. "קבלה על תיקון מזגן").
const GENERIC_DOC_LABEL_RE = /^(חשבונית|קבלה|תעודת\s*משלוח|invoice|receipt)\s*(מס\.?|#|no\.?|number)?\s*[\d\-/]*$/i

export function isGenericDocLabel(s: string | null | undefined): boolean {
  return !!s && GENERIC_DOC_LABEL_RE.test(s.trim())
}

/** First candidate that is both present and not a generic doc-type label. */
export function pickExpenseLabel(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (c && !isGenericDocLabel(c)) return c
  }
  return candidates.find((c): c is string => !!c) || ''
}

/**
 * Grouping key for "same vendor" comparisons — collapses the case/whitespace/
 * punctuation variance a supplier's raw label picks up across different bank
 * rows and extracted receipts (".VERCEL INC" / "Vercel Inc." / "VERCEL INC.")
 * without touching the displayed label itself. Not a full canonicalization
 * (aglamazo#341 is variance within literally the same name; genuinely
 * different vendor names, like "Meta" vs "Meta Platforms Ireland Limited",
 * need an actual rename — aglamazo#342).
 */
export function normalizeSupplierKey(s: string): string {
  return s.trim().replace(/^\.+/, '').replace(/\.+$/, '').replace(/\s+/g, ' ').toLowerCase()
}
