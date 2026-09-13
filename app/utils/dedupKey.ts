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

/**
 * True if a bank-sourced row and a card-sourced row represent the same
 * real-world charge (aglamazo#371): dedup previously ran card-vs-card and
 * bank-vs-bank only, so a bank export that itemizes card-level lines (some
 * FIBI exports do) could carry the exact same charge a card statement also
 * captures, landing it twice with nobody comparing across feeds. Exact
 * date+amount match, required deliberately: an off-by-a-day settlement lag
 * between feeds is plausible but unverified against live data, so this
 * under-matches rather than risk merging two genuinely different
 * same-day/same-amount charges.
 *
 * Known gap, left open on purpose: 4 real pairs were found live, but only 2
 * fit merchantsMatchForDedup's truncation shape (one side is the other with
 * characters missing from the end). The other 2 (the "CP*…SU" / "OCP*…"
 * shape) differ at BOTH ends — a dropped leading char AND an added trailing
 * one — which isn't a sub-multiset either direction, so this correctly
 * returns false for them. Catching that shape needs a looser fuzzy/edit-
 * distance match, which trades away the truncation rule's proven safety
 * against false-positiving two unrelated same-day/same-amount transactions
 * — a deliberate follow-up decision, not silently folded into this fix.
 */
export function isCrossFeedDuplicate(
  a: { date: string; amount: number; text: string },
  b: { date: string; amount: number; text: string },
): boolean {
  return a.date === b.date && a.amount === b.amount && merchantsMatchForDedup(a.text, b.text)
}
