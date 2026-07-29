// Short, human-readable, URL-safe business identifier (e.g. "Agents Head" -> "AH").
// Derived from name: first letters of the first two words, or first two
// characters of a single-word name. Same initials rule SharedBusinessIndicators
// already used for its display chip — lifted here so it's shared by the
// slug-generation migration, business creation, and any future consumer
// instead of living only inside that one component.
export function deriveSlugBase(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  const base = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] ?? '').slice(0, 2)
  const cleaned = base.toUpperCase().replace(/[^A-Za-z0-9א-ת]/g, '')
  return cleaned || 'BZ'
}

// Appends a numeric suffix until the slug doesn't collide with `existingSlugs`.
export function generateUniqueSlug(name: string, existingSlugs: Set<string>): string {
  const base = deriveSlugBase(name)
  if (!existingSlugs.has(base)) return base
  let suffix = 2
  while (existingSlugs.has(`${base}${suffix}`)) suffix++
  return `${base}${suffix}`
}
