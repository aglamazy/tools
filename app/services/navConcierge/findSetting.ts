// Lookup logic for the find_setting chat tool (#261, child task 2/3).
// Matches a free-text query against NAV_REGISTRY by label/synonym token
// overlap — deliberately simple (no NLP/embedding dependency): the LLM
// already normalizes the user's question into a short `query` string before
// calling this tool (same pattern as search_product's `query` param), so a
// token-overlap score is enough to separate "confident match" from
// "ambiguous" from "nothing close enough to guess at".
import { NAV_REGISTRY, type NavRegistryEntry } from './registry'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'׳״]/g, '') // strip Hebrew geresh/gershayim and straight quotes — "מע"מ" vs 'מעמ'
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation → space
    .trim()
}

// Hebrew/English question-phrasing filler — stripped from the QUERY only
// (never from registry text) so "איפה מוגדר X" scores the same as a bare
// "X". Without this, a query like "איפה מוגדר סטטוס מע\"מ" (4 tokens, 2 of
// them filler) scored WORSE against a real match than the bare term would,
// because the old formula normalized by query length including the filler
// (regression caught 2026-07-15 reconciling two independently-built
// registries — one had crisp 2-word labels, the other had longer, more
// descriptive labels that the filler-penalized formula couldn't reach).
const QUERY_STOPWORDS = new Set([
  'איפה', 'מוגדר', 'מוגדרת', 'איך', 'אני', 'את', 'של', 'זה', 'לאיזה', 'לאן',
  'קח', 'אותי', 'תיקח', 'משנים', 'משנה', 'עושים', 'עושה', 'נמצא', 'נמצאת',
  'where', 'is', 'the', 'do', 'i', 'to', 'find', 'take', 'me',
])

function tokens(s: string, stripStopwords = false): string[] {
  const raw = normalize(s).split(/\s+/).filter(Boolean)
  return stripStopwords ? raw.filter((t) => !QUERY_STOPWORDS.has(t)) : raw
}

function scoreEntry(queryTokens: string[], entry: NavRegistryEntry): number {
  const candidateTexts = [entry.label, ...(entry.synonyms || [])]
  let best = 0
  for (const text of candidateTexts) {
    const textTokens = new Set(tokens(text))
    if (textTokens.size === 0) continue
    let overlap = 0
    for (const qt of queryTokens) {
      // substring match both directions — catches "מע"מ" inside "סטטוס מע"מ"
      // and "vat" inside "VAT status" regardless of which side is shorter.
      for (const tt of textTokens) {
        if (tt.includes(qt) || qt.includes(tt)) {
          overlap++
          break
        }
      }
    }
    if (overlap === 0) continue
    // Recall against the CANDIDATE (how much of the synonym/label the query
    // covers) blended with precision against the QUERY (how much of the
    // query this candidate covers) via geometric mean — pure recall alone
    // let a short single-token synonym (e.g. "קיזוז") score a perfect 1.0
    // against a 2-word query ("קיזוז שותפים") even though it ignores the
    // second word entirely, tying against another entry's own short synonym
    // and forcing an unwarranted ambiguous outcome instead of a confident
    // match on the entry whose synonym actually covers the WHOLE query
    // (#311, regression surfaced by #283's test plan row 5b). Geometric mean
    // keeps a synonym that fully covers a single-word query at 1.0 (row 5a
    // unaffected — sqrt(1*1)=1) while a synonym that only covers HALF of a
    // two-word query now scores sqrt(1*0.5)≈0.71 instead of 1.0, letting an
    // exact full-phrase match (sqrt(1*1)=1) win outright. Verified against
    // every find_setting row in docs/nav-concierge-test-plan.md with the
    // SAME thresholds below — none needed retuning.
    const recall = overlap / textTokens.size
    const precision = overlap / queryTokens.length
    const score = Math.sqrt(recall * precision)
    if (score > best) best = score
  }
  return best
}

export type FindSettingResult =
  | { outcome: 'match'; entry: NavRegistryEntry }
  | { outcome: 'ambiguous'; candidates: NavRegistryEntry[] }
  | { outcome: 'not_found' }

const CONFIDENT_THRESHOLD = 0.6
const CANDIDATE_THRESHOLD = 0.5

export function findSetting(query: string): FindSettingResult {
  const queryTokens = tokens(query, true)
  if (queryTokens.length === 0) return { outcome: 'not_found' }

  const scored = NAV_REGISTRY
    .map((entry) => ({ entry, score: scoreEntry(queryTokens, entry) }))
    .filter((s) => s.score >= CANDIDATE_THRESHOLD)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return { outcome: 'not_found' }

  // Single confident top match, clearly ahead of the runner-up → match.
  const [top, second] = scored
  if (top.score >= CONFIDENT_THRESHOLD && (!second || top.score - second.score >= 0.2)) {
    return { outcome: 'match', entry: top.entry }
  }

  // Otherwise: everything within striking distance of the top score is a
  // real candidate — don't silently pick one.
  const candidates = scored
    .filter((s) => s.score >= top.score - 0.15)
    .slice(0, 4)
    .map((s) => s.entry)
  return candidates.length === 1
    ? { outcome: 'match', entry: candidates[0] }
    : { outcome: 'ambiguous', candidates }
}

/** Fills {businessId} in a path — used once the caller has resolved which business. */
export function resolvePath(entry: NavRegistryEntry, businessId?: number | string): string {
  if (!entry.requiresBusinessId) return entry.path
  if (businessId === undefined) return entry.path // caller should have asked first; leave unresolved rather than guess
  return entry.path.replace('{businessId}', String(businessId))
}

/**
 * Full find_setting action handler — query -> chat-ready reply (+ navigateTo
 * when resolved). Lives here, not inline in actionExecutor.ts's switch,
 * because that file is at the 850-line eslint cap; this keeps the tool's
 * lookup logic AND its response formatting together in one place anyway.
 */
export function handleFindSetting(rawQuery: unknown): string | { followUp: string; navigateTo: { path: string; label: string } } {
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : ''
  if (!query) return 'מה חיפשת?'

  const result = findSetting(query)
  if (result.outcome === 'not_found') {
    return 'לא מצאתי הגדרה שמתאימה לזה. אפשר לנסח אחרת?'
  }
  if (result.outcome === 'ambiguous') {
    const options = result.candidates.map((c) => `• ${c.label}${c.description ? ` — ${c.description}` : ''}`).join('\n')
    return `לא בטוח למה בדיוק התכוונת, זה יכול להיות:\n${options}\nאיזה מהם?`
  }

  const { entry } = result
  if (entry.requiresBusinessId) {
    // No server-side business context to resolve from (businesses are
    // client-local Dexie data — SessionState only tracks activeStore, the
    // grocery-domain equivalent). Ask rather than guess.
    const desc = entry.description ? ` (${entry.description})` : ''
    return `${entry.label} נמצא בהגדרות העסק${desc} — לאיזה עסק?`
  }

  const path = resolvePath(entry)
  // addressable defaults to true when omitted; entry.gap has the specific
  // reason when it's false (e.g. a tier-gating bug, or a modal that needs a
  // manual click) — surface it verbatim instead of a generic note, since the
  // registry author already worked out exactly what's missing.
  const gapNote = entry.addressable === false ? ` (${entry.gap || 'זה יביא אותך למסך הכללי, ייתכן שתצטרך לחפש/לבחור בפנים'})` : ''
  return {
    followUp: `${entry.label}${entry.description ? `: ${entry.description}` : ''}.${gapNote}`,
    navigateTo: { path, label: entry.label },
  }
}
