import type { Product } from './types'

/**
 * Extract <products> JSON block from LLM response text.
 * Returns the cleaned text (without the tag) and parsed products array.
 */
export function parseProductsFromText(raw: string): { text: string; products: Product[] } {
  let text = raw
  let products: Product[] = []

  const match = text.match(/<products>\s*([\s\S]*?)\s*<\/products>/)
  if (match) {
    try {
      products = JSON.parse(match[1])
    } catch {
      console.error('[parseProducts] Failed to parse products JSON')
    }
    text = text.replace(/<products>[\s\S]*?<\/products>/, '').trim()
  }

  // Strip long encoded strings (e.g. base64 image URLs leaked into text)
  text = text.replace(/[A-Za-z0-9+/=_-]{200,}/g, '').trim()
  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return { text, products }
}
