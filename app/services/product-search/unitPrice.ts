type ParsedQuantity = {
  amount: number
  unit: string
  displayUnit: string
}

/**
 * Parse a quantity string (Hebrew or English) into a normalized amount and unit.
 * Returns null if no quantity pattern found.
 *
 * Note: We use (?!\d) instead of \b because \b doesn't work at Hebrew boundaries.
 */
export function parseQuantity(text: string): ParsedQuantity | null {
  if (!text) return null

  // Volume patterns
  // liters: "5 ליטר", "5 ל'", "5L", "5 l"
  const literMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:ליטר|ל['׳]|[Ll](?:iter)?(?:s)?)(?!\d)/)
  if (literMatch) {
    return { amount: parseFloat(literMatch[1]), unit: 'liter', displayUnit: 'ליטר' }
  }

  // milliliters: "500 מ"ל", "500ml", "500 ml"
  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:מ"ל|מ״ל|[Mm][Ll])(?!\d)/)
  if (mlMatch) {
    const ml = parseFloat(mlMatch[1])
    return { amount: ml / 1000, unit: 'liter', displayUnit: 'ליטר' }
  }

  // Weight patterns
  // kg: "5 ק"ג", "5 קילו", "5kg", "5 kg"
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:ק"ג|ק״ג|קילו(?:גרם)?|[Kk][Gg])(?!\d)/)
  if (kgMatch) {
    return { amount: parseFloat(kgMatch[1]), unit: 'kg', displayUnit: 'ק"ג' }
  }

  // grams: "500 גרם", "500g", "500 gr"
  const gramMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:גרם|[Gg](?:r(?:am)?(?:s)?)?)(?![a-zA-Z\d])/)
  if (gramMatch) {
    const g = parseFloat(gramMatch[1])
    return { amount: g / 1000, unit: 'kg', displayUnit: 'ק"ג' }
  }

  // Count patterns
  // "מארז 12", "12 יחידות", "pack of 12"
  const packMatch = text.match(/מארז\s+(\d+)|(\d+)\s*(?:יחידות|יח['׳]|units?|pack)/i)
  if (packMatch) {
    const count = parseFloat(packMatch[1] || packMatch[2])
    return { amount: count, unit: 'unit', displayUnit: 'יחידה' }
  }

  return null
}

/**
 * Extract numeric price from a price string.
 * Handles "250 ₪", "₪250", "250.00", "1,250 ₪"
 */
export function extractNumericPrice(priceStr: string): number | null {
  if (!priceStr) return null
  const match = priceStr.match(/([\d,]+(?:\.\d{1,2})?)/)
  if (!match) return null
  return parseFloat(match[1].replace(/,/g, ''))
}

/**
 * Calculate unit price string from price and quantity.
 * e.g. "50.00 ₪/ליטר"
 */
export function calcUnitPrice(priceStr: string, quantity: ParsedQuantity): string | null {
  const price = extractNumericPrice(priceStr)
  if (!price || !quantity || quantity.amount <= 0) return null

  const unitPrice = price / quantity.amount
  return `${unitPrice.toFixed(2)} ₪/${quantity.displayUnit}`
}
