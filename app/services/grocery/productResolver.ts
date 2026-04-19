/**
 * Product resolver — matches Hebrew product names to Shufersal catalog IDs.
 *
 * Uses a persistent mapping (Firestore) + Shufersal search as fallback.
 * Once resolved, the catalogId is stored on the item and reused.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { search, type SearchResult } from './shufersalClient'
import type { GroceryItem } from './groceryStore'

interface ProductMapping {
  [hebrewName: string]: {
    catalogId: string
    shufersalName: string  // full name from Shufersal
    resolvedAt: string
  }
}

/** Load product mappings from Firestore. */
async function loadMappings(uid: string): Promise<ProductMapping> {
  const doc = await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('productMappings').get()
  return doc.exists ? (doc.data() as ProductMapping) : {}
}

/** Save product mappings to Firestore. */
async function saveMappings(uid: string, mappings: ProductMapping): Promise<void> {
  await getAdminFirestore().collection('groceries').doc(uid)
    .collection('private').doc('productMappings').set(mappings)
}

/** Look up a saved mapping (no search). Returns null if not found. */
export async function lookupMapping(uid: string, name: string) {
  const mappings = await loadMappings(uid)
  return findMapping(name, mappings)
}

/** Delete a saved mapping so user can re-pick. */
export async function deleteMapping(uid: string, name: string): Promise<boolean> {
  const mappings = await loadMappings(uid)
  const lower = name.toLowerCase()
  let deleted = false
  for (const key of Object.keys(mappings)) {
    if (key === lower || key.includes(lower) || lower.includes(key)) {
      delete mappings[key]
      deleted = true
    }
  }
  if (deleted) await saveMappings(uid, mappings)
  return deleted
}

/** Save a single product mapping (called when user picks from search results). */
export async function saveProductMapping(
  uid: string,
  hebrewName: string,
  catalogId: string,
  shufersalName: string,
): Promise<void> {
  const mappings = await loadMappings(uid)
  mappings[hebrewName.toLowerCase()] = {
    catalogId,
    shufersalName,
    resolvedAt: new Date().toISOString(),
  }
  await saveMappings(uid, mappings)
}

/**
 * Resolve a list of items — fill in catalogId where missing.
 * Returns the items with catalogId populated and a list of unresolved names.
 */
export async function resolveProducts(
  uid: string,
  items: GroceryItem[],
): Promise<{ resolved: GroceryItem[]; unresolved: string[] }> {
  const mappings = await loadMappings(uid)
  const unresolved: string[] = []
  const resolved: GroceryItem[] = []

  for (const item of items) {
    // Already has catalogId
    if (item.catalogId) {
      resolved.push(item)
      continue
    }

    // Check saved mappings (case-insensitive partial match)
    const mapping = findMapping(item.name, mappings)
    if (mapping) {
      resolved.push({ ...item, catalogId: mapping.catalogId })
      continue
    }

    // Search Shufersal
    try {
      const results = await search(uid, item.name)
      const best = pickBestMatch(item.name, results)
      if (best) {
        // Save mapping for future use
        mappings[item.name.toLowerCase()] = {
          catalogId: best.catalogId,
          shufersalName: best.name,
          resolvedAt: new Date().toISOString(),
        }
        resolved.push({ ...item, catalogId: best.catalogId })
        console.log(`[ProductResolver] "${item.name}" → ${best.catalogId} (${best.name})`)
        continue
      }
    } catch (err) {
      console.error(`[ProductResolver] Search failed for "${item.name}":`, err)
    }

    // Could not resolve
    unresolved.push(item.name)
    resolved.push(item)
  }

  // Save updated mappings
  await saveMappings(uid, mappings)

  return { resolved, unresolved }
}

/** Find a mapping by match on the item name. */
function findMapping(name: string, mappings: ProductMapping) {
  const lower = name.toLowerCase()
  // Exact match first
  if (mappings[lower]) return mappings[lower]
  // Word-level match: all words of the shorter must appear in the longer,
  // and the word-count difference must be at most 1 (avoids "צ'יפס" matching "צ'יפס קלאסי סבא שמעון")
  const queryWords = lower.split(/\s+/)
  for (const [key, value] of Object.entries(mappings)) {
    const keyWords = key.split(/\s+/)
    const shorter = queryWords.length <= keyWords.length ? queryWords : keyWords
    const longer = queryWords.length <= keyWords.length ? keyWords : queryWords
    if (longer.length - shorter.length <= 1 && shorter.every(w => longer.includes(w))) {
      return value
    }
  }
  return null
}

/** Pick the best search result matching the item name. */
function pickBestMatch(name: string, results: SearchResult[]): SearchResult | null {
  if (results.length === 0) return null

  const lower = name.toLowerCase()

  // Score each result by how well it matches
  let best: SearchResult | null = null
  let bestScore = -1

  for (const r of results) {
    const rLower = r.name.toLowerCase()
    let score = 0

    // Exact name match
    if (rLower === lower) score += 100

    // Name contains search term
    if (rLower.includes(lower)) score += 50

    // Search term contains result name
    if (lower.includes(rLower)) score += 30

    // Word overlap
    const nameWords = lower.split(/\s+/)
    const resultWords = rLower.split(/\s+/)
    const overlap = nameWords.filter(w => resultWords.some(rw => rw.includes(w) || w.includes(rw)))
    score += overlap.length * 10

    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }

  // Only return if we have some confidence
  return bestScore >= 10 ? best : results[0]
}
