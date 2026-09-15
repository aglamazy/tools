import { describe, it, expect } from 'vitest'
import { resolveOpenPeriodKey, type RollForwardPeriod } from './vatPeriodRollForward'

// aglamazo#402 — Agla: "We close now july-august and I pay it. Tomorrow I
// find Ikea invoice that I want to deduct. This one will wait to Sep-Oct
// period."

const periods: RollForwardPeriod[] = [
  { key: 'may-jun', start: new Date('2026-05-01'), end: new Date('2026-06-30T23:59:59.999') },
  { key: 'jul-aug', start: new Date('2026-07-01'), end: new Date('2026-08-31T23:59:59.999') },
  { key: 'sep-oct', start: new Date('2026-09-01'), end: new Date('2026-10-31T23:59:59.999') },
]

describe('resolveOpenPeriodKey', () => {
  it('returns the natural period when it is still open', () => {
    const closed = new Set<string>()
    expect(resolveOpenPeriodKey(new Date('2026-07-15'), periods, closed)).toBe('jul-aug')
  })

  it('rolls forward into the next open period when the natural one is closed', () => {
    const closed = new Set(['jul-aug'])
    expect(resolveOpenPeriodKey(new Date('2026-07-15'), periods, closed)).toBe('sep-oct')
  })

  it('rolls forward through multiple consecutive closed periods', () => {
    const closed = new Set(['may-jun', 'jul-aug'])
    expect(resolveOpenPeriodKey(new Date('2026-05-10'), periods, closed)).toBe('sep-oct')
  })

  it('falls back to the natural period when every later period is also closed', () => {
    const closed = new Set(['jul-aug', 'sep-oct'])
    expect(resolveOpenPeriodKey(new Date('2026-07-15'), periods, closed)).toBe('jul-aug')
  })

  it('returns undefined for a date outside every known period', () => {
    const closed = new Set<string>()
    expect(resolveOpenPeriodKey(new Date('2026-01-01'), periods, closed)).toBeUndefined()
  })
})
