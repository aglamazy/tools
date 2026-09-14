import { describe, it, expect } from 'vitest'
import { btlNoticeKey, resolveBtlScheduleByMonth, type BtlNotice, type TaxProfile } from './TaxProfileSection'

// aglamazo#376: BTL reassessed Agla mid-year; btlNotices was keyed
// one-per-year, so a second notice for the same year replaced the first
// wholesale instead of coexisting. Fixed by keying notices by id.
//
// aglamazo#388 (superseding #376's own "only the months it covers" reading,
// which was reasonable but wrong): a BTL notice for "לשנת 2026" sets the
// rate for the WHOLE YEAR, retroactively — its own schedule rows are only
// the payments still outstanding when it was issued, not its scope.
// Confirmed against BTL's own account ledger (Agla, screenshot): a 20/07
// הקטנת מקדמות of ₪29,532 satisfies exactly 6×₪6,013 − ₪29,532 = ₪6,546 =
// 6×₪1,091 — Jan-Jun really were restated to the same ₪1,091 rate as
// Jul-Dec, even though the July notice's schedule only lists Jul-Dec.

function aprilNotice(): BtlNotice {
  return {
    id: 'april',
    year: 2026,
    amount: 6013,
    annualTotal: 72156,
    uploadedAt: '2026-04-20T00:00:00.000Z',
    schedule: Array.from({ length: 12 }, (_, i) => ({
      month: `${String(i + 1).padStart(2, '0')}/2026`,
      amount: 6013,
      dueDate: `2026-${String(i + 1).padStart(2, '0')}-15`,
    })),
  }
}

function julyNotice(): BtlNotice {
  return {
    id: 'july',
    year: 2026,
    amount: 1091,
    uploadedAt: '2026-07-20T00:00:00.000Z',
    schedule: Array.from({ length: 6 }, (_, i) => ({
      month: `${String(i + 7).padStart(2, '0')}/2026`,
      amount: 1091,
      dueDate: `2026-${String(i + 7).padStart(2, '0')}-15`,
    })),
  }
}

describe('resolveBtlScheduleByMonth', () => {
  it('restates months only the EARLIER notice explicitly lists, to the LATER notice\'s rate (the real Jan-Jun case, aglamazo#388)', () => {
    const profile: TaxProfile = { btlNotices: [aprilNotice(), julyNotice()] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('01/2026')?.amount).toBe(1091)
    expect(byMonth.get('06/2026')?.amount).toBe(1091)
  })

  it('uses the later notice\'s amount for months it explicitly covers', () => {
    const profile: TaxProfile = { btlNotices: [aprilNotice(), julyNotice()] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('07/2026')?.amount).toBe(1091)
    expect(byMonth.get('12/2026')?.amount).toBe(1091)
  })

  it('a month restated (not explicitly listed) by the later notice has no due date — the real due date already passed under the superseded notice', () => {
    const profile: TaxProfile = { btlNotices: [aprilNotice(), julyNotice()] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('01/2026')?.dueDate).toBe('')
  })

  it('is order-independent — the later-uploaded notice governs the whole year regardless of array order', () => {
    const profile: TaxProfile = { btlNotices: [julyNotice(), aprilNotice()] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('01/2026')?.amount).toBe(1091)
    expect(byMonth.get('07/2026')?.amount).toBe(1091)
  })

  it('reproduces BTL\'s own reconciliation exactly: 6×6,013 minus the 20/07 הקטנת מקדמות of 29,532 equals 6×1,091', () => {
    // The proof that grounded aglamazo#388: this is not an estimate, it is
    // BTL's own ledger arithmetic.
    expect(6 * 6013 - 29532).toBe(6 * 1091)
  })

  it('ignores notices for a different year', () => {
    const profile: TaxProfile = { btlNotices: [{ ...aprilNotice(), year: 2025, id: 'other-year' }] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.size).toBe(0)
  })

  it('returns an empty map when there are no notices at all', () => {
    expect(resolveBtlScheduleByMonth({}, 2026).size).toBe(0)
  })
})

describe('btlNoticeKey', () => {
  it('uses the id when present', () => {
    expect(btlNoticeKey({ id: 'abc', year: 2026, amount: 100, uploadedAt: '2026-01-01' })).toBe('abc')
  })

  it('falls back to the year for a legacy notice with no id', () => {
    expect(btlNoticeKey({ year: 2026, amount: 100, uploadedAt: '2026-01-01' })).toBe('2026')
  })
})
