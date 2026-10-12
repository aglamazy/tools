import { describe, it, expect } from 'vitest'
import { priceLabel, sellUnitOf } from './unitLabel'

describe('priceLabel (saliko#39)', () => {
  it('carrot: per-kg price sold in a ~1 kg pack is labelled per kg', () => {
    expect(priceLabel(8.9, true, { unitName: 'מארז', estimatedKg: 1 }))
      .toEqual({ unitPrice: '8.9 ₪/ק"ג (מארז ≈ 1 ק"ג)', sellUnit: 'מארז' })
  })
  it('melon: per-kg price sold by the unit is labelled per kg', () => {
    expect(priceLabel(9.8, true, { unitName: "יח'", estimatedKg: 2 }).unitPrice).toBe('9.8 ₪/ק"ג (יח\' ≈ 2 ק"ג)')
  })
  it('banana with a kg unit, and a packaged item, are unchanged', () => {
    expect(priceLabel(15.9, true, { unitName: 'ק"ג' }).unitPrice).toBe('15.9 ₪/ק"ג')
    expect(priceLabel(12.9, false, { unitName: "יח'" }).unitPrice).toBe("12.9 ₪/יח'")
  })
  it('sellUnitOf reads the explicit unit, or the old label tail without the weight note', () => {
    expect(sellUnitOf({ sellUnit: 'מארז', unitPrice: '8.9 ₪/ק"ג (מארז ≈ 1 ק"ג)' })).toBe('מארז')
    expect(sellUnitOf({ unitPrice: "12.9 ₪/יח'" })).toBe("יח'")
  })
})
