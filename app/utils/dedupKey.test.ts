import { describe, it, expect } from 'vitest'
import {
  canonicalizeForDedup,
  merchantsMatchForDedup,
  isCrossFeedDuplicate,
  dateRangesOverlap,
  isOverlappingFileNearDuplicate,
} from './dedupKey'

const ms = (date: string) => new Date(date).getTime()

describe('canonicalizeForDedup', () => {
  it('collapses word-order-reversed (bidi) text to the same key', () => {
    // Real observed case (aglamazo#347 investigation): the same transaction
    // description reordered word-for-word by different import paths.
    const a = 'זיכוי מיידי 5373920017'
    const b = '5373920017 זיכוי מיידי'
    expect(canonicalizeForDedup(a)).toBe(canonicalizeForDedup(b))
  })

  it('is case-insensitive and strips punctuation/whitespace', () => {
    expect(canonicalizeForDedup('DIGITALOCEAN.COM')).toBe(canonicalizeForDedup('digitalocean com'))
  })
})

// aglamazo#363: Isracard's own xlsx export truncates the merchant column to
// 16 characters, so the same real charge can be "DIGITALOCEAN.COM AMSTERDAM"
// from a PDF and "DIGITALOCEAN.COM" from the xlsx of the identical
// statement. Confirmed live: tx ids 1474 (PDF) vs 2081 (xlsx).
describe('merchantsMatchForDedup', () => {
  it('matches an exact (post-canonicalization) pair', () => {
    expect(merchantsMatchForDedup('Vercel Inc.', 'VERCEL INC.')).toBe(true)
  })

  it('matches a genuine xlsx truncation of a longer PDF merchant name', () => {
    expect(merchantsMatchForDedup('DIGITALOCEAN.COM AMSTERDAM', 'DIGITALOCEAN.COM')).toBe(true)
    expect(merchantsMatchForDedup('DIGITALOCEAN.COM', 'DIGITALOCEAN.COM AMSTERDAM')).toBe(true)
  })

  it('does not match two genuinely different merchants of the same length', () => {
    expect(merchantsMatchForDedup('MACSBAGS', 'PELEPHONE')).toBe(false)
  })

  it('does not match two different merchants just because one is short', () => {
    // "פלאפל" (falafel) is unrelated to a long vendor name that happens to
    // contain some overlapping letters -- must not fuzzy-match on that alone.
    expect(merchantsMatchForDedup('פלאפל', 'DIGITALOCEAN.COM AMSTERDAM')).toBe(false)
  })

  it('requires the shorter side to carry real content (length >= 4)', () => {
    expect(merchantsMatchForDedup('VAT', 'VATICAN IMPORTS LTD')).toBe(false)
  })

  it('a same-length but different-content pair is a real mismatch, not a truncation', () => {
    expect(merchantsMatchForDedup('ABCD', 'DCBE')).toBe(false)
  })
})

// aglamazo#371: dedup ran card-vs-card and bank-vs-bank only — a bank export
// that itemizes card-level lines can carry the same real charge a card
// statement also captures. 4 live pairs found, all differing by ~1 character
// in the merchant/description field (the #363 truncation shape).
describe('isCrossFeedDuplicate', () => {
  it('matches the real live Anthropic pair (bank description vs card merchant)', () => {
    const bank = { date: '2026-06-10', amount: -517.69, text: 'ANTHROPIC* CLAUDE SU' }
    const card = { date: '2026-06-10', amount: -517.69, text: 'ANTHROPIC* CLAUDE SUB' }
    expect(isCrossFeedDuplicate(bank, card)).toBe(true)
  })

  it('matches the real live falafel pair (single-character insertion)', () => {
    const bank = { date: '2026-05-10', amount: -98.00, text: 'פלאלפל בריבוע צורן-מ' }
    const card = { date: '2026-05-10', amount: -98.00, text: 'פלאפל בריבוע צורן-מ' }
    expect(isCrossFeedDuplicate(bank, card)).toBe(true)
  })

  it('does NOT match the real live MACSBAGS pair — known gap, documented on purpose', () => {
    // "CP*MACSBAGS -תיקוןSU" vs "OCP*MACSBAGS -תיקון": the bank side adds a
    // trailing "SU" AND drops the card side's leading "O" — two independent
    // edits, not a pure truncation, so it isn't a sub-multiset of the other
    // side either way. Confirmed a real duplicate by Sheli/Agla (aglamazo#371)
    // and cleaned up manually, but NOT caught by this rule going forward —
    // widening the match to catch it (edit-distance/fuzzy matching) trades
    // away the truncation rule's proven safety against false-positiving two
    // genuinely different same-day/same-amount transactions, and deserves
    // its own explicit decision rather than silently expanding this fix.
    const bank = { date: '2026-03-20', amount: -158.40, text: 'CP*MACSBAGS -תיקוןSU' }
    const card = { date: '2026-03-20', amount: -158.40, text: 'OCP*MACSBAGS -תיקון' }
    expect(isCrossFeedDuplicate(bank, card)).toBe(false)
  })

  it('does not match when the date differs, even with identical amount and merchant', () => {
    const bank = { date: '2026-03-19', amount: -158.40, text: 'MACSBAGS' }
    const card = { date: '2026-03-20', amount: -158.40, text: 'MACSBAGS' }
    expect(isCrossFeedDuplicate(bank, card)).toBe(false)
  })

  it('does not match when the amount differs, even with identical date and merchant', () => {
    const bank = { date: '2026-03-20', amount: -1.40, text: 'MACSBAGS' }
    const card = { date: '2026-03-20', amount: -158.40, text: 'MACSBAGS' }
    expect(isCrossFeedDuplicate(bank, card)).toBe(false)
  })

  it('does not match two genuinely different same-day/same-amount merchants', () => {
    const bank = { date: '2026-05-10', amount: -98.00, text: 'PELEPHONE' }
    const card = { date: '2026-05-10', amount: -98.00, text: 'MACSBAGS' }
    expect(isCrossFeedDuplicate(bank, card)).toBe(false)
  })
})

describe('dateRangesOverlap', () => {
  it('is true when ranges intersect', () => {
    expect(dateRangesOverlap({ minMs: ms('2026-07-01'), maxMs: ms('2026-08-16') }, { minMs: ms('2026-08-01'), maxMs: ms('2026-09-07') })).toBe(true)
  })

  it('is false when ranges are disjoint', () => {
    expect(dateRangesOverlap({ minMs: ms('2026-01-01'), maxMs: ms('2026-01-31') }, { minMs: ms('2026-06-01'), maxMs: ms('2026-06-30') })).toBe(false)
  })

  it('is true when ranges touch at a single point', () => {
    expect(dateRangesOverlap({ minMs: ms('2026-01-01'), maxMs: ms('2026-02-01') }, { minMs: ms('2026-02-01'), maxMs: ms('2026-03-01') })).toBe(true)
  })
})

// aglamazo#375, Sheli 2026-09-14: two overlapping bank-statement PDF exports
// (Jul1-Aug16 and Aug1-Sep7) printed the same ₪756.16 קיזוז reversal on
// different days (08-05 vs 08-06) -- exact-date dedup missed it, ₪756.16 of
// phantom income landed in the classified books.
describe('isOverlappingFileNearDuplicate', () => {
  const overlappingRangeA = { minMs: ms('2026-07-01'), maxMs: ms('2026-08-16') }
  const overlappingRangeB = { minMs: ms('2026-08-01'), maxMs: ms('2026-09-07') }

  it('matches the real live קיזוז pair — same amount/description, 1 day apart, overlapping files', () => {
    const a = { dateMs: ms('2026-08-06'), amount: 756.16, text: 'החזרת חיוב עפ הרשאה מסיבות טכניות הום סימיקארד', fileRange: overlappingRangeA }
    const b = { dateMs: ms('2026-08-05'), amount: 756.16, text: 'החזרת חיוב עפ הרשאה מסיבות טכניות הום סימיקארד', fileRange: overlappingRangeB }
    expect(isOverlappingFileNearDuplicate(a, b)).toBe(true)
  })

  it('does NOT match genuinely separate same-amount/description charges from non-overlapping files (the פנגו case)', () => {
    const nonOverlappingA = { minMs: ms('2025-09-01'), maxMs: ms('2025-09-10') }
    const nonOverlappingB = { minMs: ms('2025-09-20'), maxMs: ms('2025-09-30') }
    const a = { dateMs: ms('2025-09-05'), amount: 25, text: 'פנגו-חניונים', fileRange: nonOverlappingA }
    const b = { dateMs: ms('2025-09-06'), amount: 25, text: 'פנגו-חניונים', fileRange: nonOverlappingB }
    expect(isOverlappingFileNearDuplicate(a, b)).toBe(false)
  })

  it('does not match beyond the day tolerance even with overlapping files', () => {
    const a = { dateMs: ms('2026-08-01'), amount: 756.16, text: 'קיזוז', fileRange: overlappingRangeA }
    const b = { dateMs: ms('2026-08-10'), amount: 756.16, text: 'קיזוז', fileRange: overlappingRangeB }
    expect(isOverlappingFileNearDuplicate(a, b)).toBe(false)
  })

  it('does not match when the amount differs', () => {
    const a = { dateMs: ms('2026-08-06'), amount: 756.16, text: 'קיזוז', fileRange: overlappingRangeA }
    const b = { dateMs: ms('2026-08-05'), amount: 999, text: 'קיזוז', fileRange: overlappingRangeB }
    expect(isOverlappingFileNearDuplicate(a, b)).toBe(false)
  })

  it('does not match when either file range is missing (no fileId or no parsable dates in that file)', () => {
    const a = { dateMs: ms('2026-08-06'), amount: 756.16, text: 'קיזוז', fileRange: null }
    const b = { dateMs: ms('2026-08-05'), amount: 756.16, text: 'קיזוז', fileRange: overlappingRangeB }
    expect(isOverlappingFileNearDuplicate(a, b)).toBe(false)
  })
})
