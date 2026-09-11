import { describe, it, expect } from 'vitest'
import { canonicalizeForDedup, merchantsMatchForDedup } from './dedupKey'

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
