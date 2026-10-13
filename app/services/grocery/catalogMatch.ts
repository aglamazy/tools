/**
 * Name matching + ranking for a store catalog search (saliko#34).
 *
 * Two defects this replaces in the Rexail search:
 *  - The query was matched as a raw substring, so the plural "עגבניות" never
 *    matched the fresh singular "עגבניה אשכולות" and only hit processed goods
 *    whose names carry the plural ("רוטב עגבניות").
 *  - Results were ordered by price alone, so cheap sauces/cans led the picker.
 *
 * Matching compares Hebrew stems (plural/singular suffix stripped, final
 * letters folded) per query word. Ranking puts fresh produce first, then names
 * that START with the query word (the item itself, not "sauce of X"), then price.
 */

const FINAL_TO_REGULAR: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }

function foldFinals(s: string): string {
  return s.replace(/[ךםןףץ]/g, c => FINAL_TO_REGULAR[c])
}

/** Hebrew-aware stem of one word: folds final letters, drops ות/ים/ה/ת/י endings. */
export function hebrewStem(word: string): string {
  let w = foldFinals(word.trim().toLowerCase().replace(/["'׳״]/g, ''))
  for (const suffix of ['ות', 'ימ']) { // 'ים' after final-letter folding
    if (w.length - suffix.length >= 3 && w.endsWith(suffix)) return w.slice(0, -suffix.length)
  }
  // Singular ה/ת ending, or construct-plural י ('תפוחי אדמה' → תפוח).
  if (w.length >= 4 && (w.endsWith('ה') || w.endsWith('ת') || w.endsWith('י'))) w = w.slice(0, -1)
  return w
}

function words(text: string): string[] {
  return foldFinals(text.toLowerCase().replace(/["'׳״]/g, '')).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

/** True when every query word's stem starts some word of the name. */
export function nameMatchesQuery(name: string, query: string): boolean {
  const qStems = words(query).map(hebrewStem).filter(s => s.length >= 2)
  if (qStems.length === 0) return false
  const nameWords = words(name)
  return qStems.every(stem => nameWords.some(w => w.startsWith(stem)))
}

const FRESH_CATEGORY = /ירק|פירות/
const NOT_FRESH_CATEGORY = /יבש|קפוא|שימור|מיץ|רטב|ממרח|פיצוח/
/** Processed goods that sometimes sit inside a fresh category ("עגבניות מיובשות" under ירקות גינה). */
const PROCESSED_NAME = /מיובש|מרוסק|קפוא|רוטב|מחית|ממרח|שימור|במיץ|צ'יפס|ריבה/

/** Fresh fruit/veg by catalog category, excluding dried/frozen/canned/sauces. */
export function isFreshProduce(category: string, parentCategory: string, name = ''): boolean {
  const path = `${parentCategory} ${category}`
  return FRESH_CATEGORY.test(path) && !NOT_FRESH_CATEGORY.test(path) && !PROCESSED_NAME.test(name)
}

/** Two-word names that are a different product from their first word ("תפוח אדמה" is a potato, not an apple). */
const COMPOUND_HEADS = [['תפוח', 'אדמ']]

/** Name starts with the first query word: the product IS the thing asked for. */
function isHeadMatch(name: string, query: string): boolean {
  const q = words(query).map(hebrewStem)
  const [head, second = ''] = words(name).map(hebrewStem)
  if (!q[0] || !head || !head.startsWith(q[0])) return false
  return !COMPOUND_HEADS.some(([h, s]) => head.startsWith(h) && second.startsWith(s) && !q.some(w => w.startsWith(s)))
}

export interface RankableProduct {
  name: string
  fullName: string
  category: string
  parentCategory: string
  price: number
}

/** Rank: fresh produce, then head-noun match, then cheapest. Stable for ties. */
export function rankCatalogMatches<T extends RankableProduct>(products: T[], query: string): T[] {
  const score = (p: T) =>
    (isFreshProduce(p.category, p.parentCategory, p.fullName || p.name) ? 2 : 0) + (isHeadMatch(p.fullName || p.name, query) ? 1 : 0)
  return products
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => b.s - a.s || (a.p.price || 999) - (b.p.price || 999) || a.i - b.i)
    .map(x => x.p)
}
