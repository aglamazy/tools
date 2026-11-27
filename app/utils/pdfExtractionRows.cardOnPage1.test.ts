import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { transactionStore } from '@/app/stores/transactionStore'
import { parseCreditWithRegistry } from './creditCardParser'
import {
  mergeExtractions,
  reconcileCreditTotals,
  toSheetRows,
  validateChunkExtraction,
  withKnownIdentifiers,
  type Extraction,
  type ExtractedRow,
} from './pdfExtractionRows'

// aglamazo#504 — the 10/09/26 card 1473 statement (4 pages, 18,947.38 =
// 3,766.93 + 15,180.45) prints the card number on page 1 only; prod 603274e
// failed chunks 2/4 and 3/4 with 422 "no card number" on all 3 attempts.
const row = (merchant: string, billAmount: number): ExtractedRow => ({
  date: '20/08/2026', merchant, txAmount: billAmount, billAmount, currency: 'ILS',
})

const page1: Extraction = {
  kind: 'credit', cardNumber: '1473', billingDate: '10/09/2026', statementTotals: [],
  rows: [row('A', 1000), row('B', 766.93)],
}
const page2: Extraction = {
  kind: 'credit', cardNumber: null, billingDate: null, statementTotals: [3766.93],
  rows: [row('C', 2000)],
}
const page3: Extraction = {
  kind: 'credit', cardNumber: null, billingDate: null, statementTotals: [],
  rows: [row('D', 10000), row('E', 5180.45)],
}
const page4: Extraction = {
  kind: 'credit', cardNumber: null, billingDate: null, statementTotals: [15180.45],
  rows: [],
}

describe('card number printed on page 1 only (aglamazo#504)', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
  })

  it('a later chunk with no card number is rejected only when page 1 gave none', () => {
    expect(validateChunkExtraction(page2)).toContain('מספר כרטיס')
    const known = { cardNumber: page1.cardNumber }
    for (const p of [page2, page3, page4]) {
      expect(validateChunkExtraction(p, known)).toBeNull()
    }
  })

  it('page 1 itself still needs a card number (aglamazo#358 degenerate-read guard)', () => {
    expect(validateChunkExtraction({ ...page1, cardNumber: null })).toContain('מספר כרטיס')
  })

  it('imports the whole statement and stores 18,947.38', async () => {
    const known = { cardNumber: page1.cardNumber }
    const chunks = [page1, ...[page2, page3, page4].map((p) => withKnownIdentifiers(p, known))]
    expect(chunks.every((c) => c.cardNumber === '1473')).toBe(true)

    const merged = mergeExtractions(chunks)
    expect(reconcileCreditTotals(merged)).toBeNull()

    const parsed = parseCreditWithRegistry(toSheetRows(merged))
    expect(parsed.cardNumber).toBe('1473')
    await transactionStore.saveCreditCardData('1473', parsed.statement.payments, '2026-09-10', '09/2026', 'sep-1473')

    const stored = await db.transactions.where('type').equals('credit').and((t) => t.cardNumber === '1473').toArray()
    expect(stored).toHaveLength(5)
    const total = Math.round(stored.reduce((s, t) => s + t.amount, 0) * 100) / 100
    expect(total).toBe(-18947.38)
  })
})
