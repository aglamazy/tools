import { describe, it, expect } from 'vitest'
import { btlNoticeKey, resolveBtlScheduleByMonth, type BtlNotice, type TaxProfile } from './TaxProfileSection'

// aglamazo#376, Sheli 2026-09-14, Agla: "Good morning, please handle 375"
// (and separately #376): BTL reassessed Agla mid-year. The April notice
// (₪6,013/month, Jan-Dec schedule) was replaced wholesale by the July
// notice (₪1,091/month, Jul-Dec schedule only) because btlNotices was keyed
// one-per-year -- silently restating Jan-Jun from ₪6,013 to ₪1,091 even
// though five real payments at ₪6,013 are in the books for those months.

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
  it('keeps the earlier notice\'s amount for months only it covers (the real Jan-Jun bug)', () => {
    const profile: TaxProfile = { btlNotices: [aprilNotice(), julyNotice()] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('01/2026')?.amount).toBe(6013)
    expect(byMonth.get('06/2026')?.amount).toBe(6013)
  })

  it('uses the later notice\'s amount for months only it covers', () => {
    const profile: TaxProfile = { btlNotices: [aprilNotice(), julyNotice()] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('07/2026')?.amount).toBe(1091)
    expect(byMonth.get('12/2026')?.amount).toBe(1091)
  })

  it('is order-independent — the later-uploaded notice wins regardless of array order', () => {
    const profile: TaxProfile = { btlNotices: [julyNotice(), aprilNotice()] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('01/2026')?.amount).toBe(6013)
    expect(byMonth.get('07/2026')?.amount).toBe(1091)
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

// aglamazo#390, Agla via Sheli: June 2026 isn't derivable from any notice
// (April lists it at 6,013, July never mentions it, the 29,532 reduction
// names no month) — a manual override is his own judgment call, never
// inferred by the app.
describe('resolveBtlScheduleByMonth — manual overrides (aglamazo#390)', () => {
  it('a month override wins over what the notices say for that month (the real June case)', () => {
    const profile: TaxProfile = {
      btlNotices: [aprilNotice(), julyNotice()],
      btlMonthOverrides: [{ month: '06/2026', amount: 1091, note: 'הבדיקה: יתרת בל"ל אחרי הקטנה = 2×1,091' }],
    }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('06/2026')?.amount).toBe(1091)
    expect(byMonth.get('06/2026')?.isOverride).toBe(true)
    expect(byMonth.get('06/2026')?.overrideNote).toContain('יתרת בל"ל')
  })

  it('leaves every other month untouched by an override elsewhere', () => {
    const profile: TaxProfile = {
      btlNotices: [aprilNotice(), julyNotice()],
      btlMonthOverrides: [{ month: '06/2026', amount: 1091 }],
    }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('01/2026')?.amount).toBe(6013)
    expect(byMonth.get('01/2026')?.isOverride).toBeUndefined()
    expect(byMonth.get('07/2026')?.amount).toBe(1091)
  })

  it('creates an entry for a month even with no covering notice at all', () => {
    const profile: TaxProfile = { btlMonthOverrides: [{ month: '06/2026', amount: 500 }] }
    const byMonth = resolveBtlScheduleByMonth(profile, 2026)
    expect(byMonth.get('06/2026')?.amount).toBe(500)
    expect(byMonth.size).toBe(1)
  })

  it('ignores an override for a different year', () => {
    const profile: TaxProfile = { btlMonthOverrides: [{ month: '06/2025', amount: 500 }] }
    expect(resolveBtlScheduleByMonth(profile, 2026).size).toBe(0)
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
