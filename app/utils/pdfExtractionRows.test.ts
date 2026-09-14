import { describe, it, expect } from 'vitest'
import { toSheetRows, type Extraction } from './pdfExtractionRows'

// aglamazo#372, Agla 2026-09-14: two real ANTHROPIC CLAUDE SUB rows were
// imported at their USD amount (-200.00) instead of the real NIS charge
// (~607.21/605.60) — a foreign-currency "not yet settled" row
// (עסקאות שטרם נקלטו) has no NIS figure anywhere in the source document at
// all, and the old `r.billAmount ?? r.txAmount ?? 0` fallback silently
// wrote the USD figure into the NIS column. Confirmed against the real
// source: 1473_08_2026.pdf (pdftotext) shows the row WITH both amounts
// ($200.00 / ₪607.21) on the settled table; 1473_10_2026.xlsx's
// "עסקאות שטרם נקלטו" section has ONLY the $200.00 figure — no NIS column
// exists on that section at all.

function creditExtraction(rows: Extraction['rows']): Extraction {
  return { kind: 'credit', cardNumber: '1473', billingDate: '10/08/2026', rows }
}

describe('toSheetRows (credit) — foreign-currency billAmount handling (aglamazo#372)', () => {
  it('uses the NIS billAmount when present alongside a foreign txAmount (the real settled #700005-style row)', () => {
    const sheet = toSheetRows(
      creditExtraction([
        { date: '09/07/2026', merchant: 'ANTHROPIC* CLAUDE SUB', txAmount: 200, billAmount: 607.21, currency: 'USD', detail: 'הוראת קבע' },
      ]),
    )
    const dataRow = sheet.find((r) => r[1] === 'ANTHROPIC* CLAUDE SUB')!
    expect(dataRow[3]).toBe(607.21) // סכום חיוב column
  })

  it('EXCLUDES a foreign-currency row with no billAmount instead of writing the USD figure as NIS (the real #900003/#372 case)', () => {
    const sheet = toSheetRows(
      creditExtraction([
        { date: '09/09/2026', merchant: 'ANTHROPIC* CLAUDE SUB', txAmount: 200, billAmount: null, currency: 'USD', detail: undefined },
      ]),
    )
    expect(sheet.some((r) => r[1] === 'ANTHROPIC* CLAUDE SUB')).toBe(false)
  })

  it('still falls back to txAmount when the row is domestic (ILS) and billAmount is missing', () => {
    const sheet = toSheetRows(
      creditExtraction([
        { date: '09/09/2026', merchant: 'סופר פארם', txAmount: 45.5, billAmount: null, currency: 'ILS' },
      ]),
    )
    const dataRow = sheet.find((r) => r[1] === 'סופר פארם')!
    expect(dataRow[3]).toBe(45.5)
  })

  it('falls back to txAmount when currency is unspecified (assume domestic, unchanged prior behavior)', () => {
    const sheet = toSheetRows(
      creditExtraction([
        { date: '09/09/2026', merchant: 'ציבו', txAmount: 60, billAmount: null, currency: null },
      ]),
    )
    const dataRow = sheet.find((r) => r[1] === 'ציבו')!
    expect(dataRow[3]).toBe(60)
  })
})
