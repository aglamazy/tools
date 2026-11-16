import { describe, it, expect } from 'vitest'
import { withForeignVatZero } from './foreignVat'

describe('withForeignVatZero (aglamazo#488 clause 2b)', () => {
  it('the measured Anthropic receipt: USD with vatAmount null records VAT 0', () => {
    const out = withForeignVatZero({ vendor: 'Anthropic, PBC', amount: 200, currency: 'USD', vatAmount: null })
    expect(out.vatAmount).toBe(0)
    expect(out.amount).toBe(200)
  })
  it('an ILS document with no VAT stated stays empty (not invented)', () => {
    expect(withForeignVatZero({ currency: 'ILS', vatAmount: null }).vatAmount).toBeNull()
    expect(withForeignVatZero({ currency: '₪', vatAmount: undefined }).vatAmount).toBeUndefined()
  })
  it('no currency read stays empty', () => {
    expect(withForeignVatZero({ vatAmount: null }).vatAmount).toBeNull()
  })
  it('a VAT amount the foreign document states is kept', () => {
    expect(withForeignVatZero({ currency: 'EUR', vatAmount: 19 }).vatAmount).toBe(19)
  })
})
