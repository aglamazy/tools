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

/**
 * True if the shorter of two SORTED canonicalizeForDedup outputs is a
 * sub-multiset of the longer one — i.e. every character in the shorter
 * string appears in the longer string at least as many times.
 */
function isSubMultiset(shorter: string, longer: string): boolean {
  let i = 0
  for (const ch of longer) {
    if (i < shorter.length && shorter[i] === ch) i++
  }
  return i === shorter.length
}

/**
 * Same-transaction check for a merchant/description field that survives a
 * genuine TRUNCATION, not just reordering (aglamazo#363): Isracard's own
 * xlsx export truncates the merchant column to 16 characters, so a PDF
 * import of "DIGITALOCEAN.COM AMSTERDAM" and an xlsx import of the same
 * real charge as "DIGITALOCEAN.COM" have completely different exact-match
 * dedup keys despite being the same transaction. canonicalizeForDedup alone
 * can't absorb this — it makes reordering harmless, not missing characters.
 *
 * Exact match first (the common case); if lengths differ, treat the shorter
 * one's characters as a truncation only if they're ALL present in the
 * longer one (sub-multiset, since both are sorted) AND long enough to be
 * real content — a bare few characters matching by coincidence against an
 * unrelated long name is not evidence of the same vendor.
 */
export function merchantsMatchForDedup(a: string, b: string): boolean {
  const normA = canonicalizeForDedup(a)
  const normB = canonicalizeForDedup(b)
  if (normA === normB) return true
  if (normA.length === normB.length) return false
  const [shorter, longer] = normA.length < normB.length ? [normA, normB] : [normB, normA]
  if (shorter.length < 4) return false
  return isSubMultiset(shorter, longer)
}
