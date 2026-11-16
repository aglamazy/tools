/**
 * aglamazo#488 clause 2b: a document charged in a foreign currency (USD, EUR…)
 * comes from a foreign vendor, so its Israeli input VAT is 0 by design.
 * Measured on Agla's Anthropic receipt #2785-8854-3966 ($200, 09/11/2026):
 * extraction answered currency "USD" with vatAmount null, which the VAT
 * list shows as an empty field. A VAT amount the document states is kept.
 */
const LOCAL_CURRENCIES = new Set(['ILS', 'NIS', '₪', 'ש"ח', 'ש״ח', 'שח'])

export function withForeignVatZero<T extends { currency?: unknown; vatAmount?: unknown }>(data: T): T {
  if (!data || typeof data !== 'object') return data
  const currency = typeof data.currency === 'string' ? data.currency.trim().toUpperCase() : ''
  if (!currency || LOCAL_CURRENCIES.has(currency)) return data
  if (typeof data.vatAmount === 'number') return data
  return { ...data, vatAmount: 0 }
}
