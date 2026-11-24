import { describe, it, expect } from 'vitest'
import {
  findAmbiguousCreditRows,
  mergeExtractions,
  reconcileCreditTotals,
  type Extraction,
  type ExtractedRow,
} from './pdfExtractionRows'

// aglamazo#452 — shapes measured on the real Oct 1473 statement (2026-11-24):
// a foreign row whose NIS figure was dropped, a refund, and a short read.
const page = (rows: ExtractedRow[], statementTotals: number[] = []): Extraction => ({
  kind: 'credit',
  cardNumber: '1473',
  billingDate: '11/10/2026',
  statementTotals,
  rows,
})

const ils = (merchant: string, amount: number): ExtractedRow => ({
  date: '01/10/2026', merchant, txAmount: Math.abs(amount), billAmount: amount, currency: 'ILS',
})
const vodafone: ExtractedRow = {
  date: '02/10/2026', merchant: 'ALL VODAFONE ALBANIA S', txAmount: 4400, billAmount: 167.45, currency: 'ALL',
}
const refund = ils('חבר הצגות', -278)

describe('reconcileCreditTotals (aglamazo#452)', () => {
  it('passes when rows across pages sum to the printed totals, refund netted', () => {
    const merged = mergeExtractions([
      page([ils('A', 100), vodafone]),
      page([ils('B', 200)], [467.45]),
      page([ils('C', 400), refund], [122]),
    ])
    expect(merged.statementTotals).toEqual([467.45, 122])
    expect(reconcileCreditTotals(merged)).toBeNull()
  })

  it('fails a short read (4 of ~93 rows on prod)', () => {
    const merged = mergeExtractions([page([ils('A', 100)], [22747.97])])
    expect(reconcileCreditTotals(merged)).toContain('22747.97')
  })

  it('fails when a foreign row lost its NIS amount and fell back to the original amount', () => {
    const lost = { ...vodafone, billAmount: null, currency: null }
    expect(reconcileCreditTotals(page([lost], [167.45]))).toContain('4400.00')
  })

  it('fails a charge read as a refund (PAYBOX 70 read as -70: 140 short)', () => {
    expect(reconcileCreditTotals(page([ils('PAYBOX', -70), ils('X', 100)], [170]))).not.toBeNull()
  })

  it('fails an invented row (category column read as its own row: 30 over)', () => {
    expect(reconcileCreditTotals(page([ils('חנות תנובות', 30), ils('דלק', 30)], [30]))).not.toBeNull()
  })

  it('does not block when the statement printed no total', () => {
    expect(reconcileCreditTotals(page([ils('A', 100)]))).toBeNull()
  })
})

describe('findAmbiguousCreditRows (aglamazo#452)', () => {
  it('flags a row with neither a NIS billAmount nor a currency', () => {
    const rows = findAmbiguousCreditRows(page([{ date: '15/09/2026', merchant: 'ANTHROPIC', txAmount: 138 }]))
    expect(rows).toHaveLength(1)
  })

  it('accepts a row with billAmount, and a pending foreign row with currency only', () => {
    const rows = findAmbiguousCreditRows(page([vodafone, { date: '05/10/2026', merchant: 'X', txAmount: 20, billAmount: null, currency: 'USD' }]))
    expect(rows).toHaveLength(0)
  })
})
