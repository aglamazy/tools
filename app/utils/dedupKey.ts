// Bank/credit statements re-imported from a different source (XLS vs PDF) can
// describe the SAME transaction with the same characters in a different order —
// mixed Hebrew/Latin (bidi) text gets reflowed differently by each parser, e.g.
// "זיכוי מבנק י-ם עקב מUS(LLC) ERVICES" vs "US(LLC)ERVICES זיכוי מבנק י-ם מ".
// An exact-string dedup key treats these as different transactions.
//
// Sorting the individual characters (after stripping whitespace/punctuation)
// collapses any such reordering to the same key, since it only depends on the
// SET of characters present — not their grouping into words or visual order.
// Genuinely different text still produces a different key.
export function canonicalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .split('')
    .sort()
    .join('')
}
