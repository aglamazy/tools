/**
 * Price label for a catalog item (saliko#39).
 *
 * Rexail quotes `price` PER KG for every soldByWeight item, even when the only
 * way to buy it is a pack or a whole unit (carrot: מארז ≈ 1 kg; melon: יח' ≈ 2 kg).
 * The old label paired that per-kg price with the selling unit ("8.9 ₪/מארז",
 * "9.8 ₪/יח'"), which the store itself shows as per kg. Weight items are now
 * always labelled per kg, with the unit you actually buy, and its estimated
 * weight, after it. `sellUnit` carries the buying unit explicitly so callers
 * stop re-parsing it out of the label.
 */

export interface UnitChoice { unitName: string; estimatedKg?: number }

const KG = 'ק"ג'

export function priceLabel(price: number | string, soldByWeight: boolean, unit: UnitChoice | undefined): { unitPrice: string; sellUnit: string } {
  const sellUnit = unit?.unitName || ''
  if (!soldByWeight || !sellUnit) return { unitPrice: `${price} ₪/${sellUnit}`, sellUnit }
  if (sellUnit === KG) return { unitPrice: `${price} ₪/${KG}`, sellUnit }
  const weight = unit?.estimatedKg && unit.estimatedKg > 0 ? `${sellUnit} ≈ ${+unit.estimatedKg.toFixed(2)} ${KG}` : `נמכר ב${sellUnit}`
  return { unitPrice: `${price} ₪/${KG} (${weight})`, sellUnit }
}

/** The unit an item is bought in: explicit when present, else read from an older "price ₪/unit" label. */
export function sellUnitOf(r: { sellUnit?: string; unitPrice?: string }): string | undefined {
  if (r.sellUnit) return r.sellUnit
  const tail = r.unitPrice?.split('/').pop()?.trim()
  return tail ? tail.replace(/\s*\(.*\)\s*$/, '') || undefined : undefined
}
