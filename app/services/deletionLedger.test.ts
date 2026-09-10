import { describe, it, expect } from 'vitest'
import { entrySyncId, entryDeletedAt, isFreshTombstone, makeDeletionEntry, FRESH_TOMBSTONE_WINDOW_MS } from './deletionLedger'

describe('deletionLedger', () => {
  it('entrySyncId/entryDeletedAt handle both legacy (bare string) and timestamped shapes', () => {
    expect(entrySyncId('abc')).toBe('abc')
    expect(entryDeletedAt('abc')).toBeNull()
    const e = makeDeletionEntry('xyz')
    expect(entrySyncId(e)).toBe('xyz')
    expect(entryDeletedAt(e)).toBe(e.deletedAt)
  })

  it('a legacy (null) deletedAt is never fresh — preserves today\'s guard behavior', () => {
    expect(isFreshTombstone(null)).toBe(false)
  })

  it('an invalid date string is never fresh (fails safe, not open)', () => {
    expect(isFreshTombstone('not-a-date')).toBe(false)
  })

  it('a just-deleted (3s old) tombstone is fresh — the exact race window this fix closes', () => {
    const now = Date.now()
    const deletedAt = new Date(now - 3000).toISOString()
    expect(isFreshTombstone(deletedAt, now)).toBe(true)
  })

  it('a 60-day-old tombstone is not fresh — preserves the July-22 cross-device protection', () => {
    const now = Date.now()
    const deletedAt = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString()
    expect(isFreshTombstone(deletedAt, now)).toBe(false)
  })

  it('freshness window boundary is exact', () => {
    const now = Date.now()
    const justUnder = new Date(now - (FRESH_TOMBSTONE_WINDOW_MS - 1000)).toISOString()
    const justOver = new Date(now - (FRESH_TOMBSTONE_WINDOW_MS + 1000)).toISOString()
    expect(isFreshTombstone(justUnder, now)).toBe(true)
    expect(isFreshTombstone(justOver, now)).toBe(false)
  })

  // 2026-09-10 live incident: a literal `undefined`/`null` element in a
  // ledger array (pre-existing legacy data, inert under the old plain-string
  // reader) crashed every sync cycle the instant this module started doing
  // unconditional property access on every entry. Must never throw again.
  it('a malformed entry (undefined, null, or a bare object with no syncId) never throws', () => {
    expect(() => entrySyncId(undefined as any)).not.toThrow()
    expect(() => entrySyncId(null as any)).not.toThrow()
    expect(() => entrySyncId({} as any)).not.toThrow()
    expect(entrySyncId(undefined as any)).toBe('')
    expect(entrySyncId(null as any)).toBe('')
    expect(entrySyncId({} as any)).toBe('')
    expect(() => entryDeletedAt(undefined as any)).not.toThrow()
    expect(entryDeletedAt(undefined as any)).toBeNull()
  })
})
