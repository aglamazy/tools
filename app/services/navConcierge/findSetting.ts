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

function tokens(s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean)
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
    const score = overlap / Math.max(queryTokens.length, textTokens.size)
    if (score > best) best = score
  }
  return best
}

export type FindSettingResult =
  | { outcome: 'match'; entry: NavRegistryEntry }
  | { outcome: 'ambiguous'; candidates: NavRegistryEntry[] }
  | { outcome: 'not_found' }

const CONFIDENT_THRESHOLD = 0.6
const CANDIDATE_THRESHOLD = 0.3

export function findSetting(query: string): FindSettingResult {
  const queryTokens = tokens(query)
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
    const options = result.candidates.map((c) => `• ${c.label} — ${c.description}`).join('\n')
    return `לא בטוח למה בדיוק התכוונת, זה יכול להיות:\n${options}\nאיזה מהם?`
  }

  const { entry } = result
  if (entry.requiresBusinessId) {
    // No server-side business context to resolve from (businesses are
    // client-local Dexie data — SessionState only tracks activeStore, the
    // grocery-domain equivalent). Ask rather than guess.
    return `${entry.label} נמצא בהגדרות העסק (${entry.description}) — לאיזה עסק?`
  }

  const path = resolvePath(entry)
  const gapNote = entry.landsOnTabOnly ? ' (זה יביא אותך ללשונית הנכונה, אולי תצטרך לגלול/לבחור בפנים)' : ''
  return {
    followUp: `${entry.label}: ${entry.description}.${gapNote}`,
    navigateTo: { path, label: entry.label },
  }
}
