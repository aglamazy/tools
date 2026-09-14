import { describe, it, expect } from 'vitest'
import { docDisplayDate, formatDateForDisplay } from './InvoicesTab'

// aglamazo#377, Sheli 2026-09-14: an hourly invoice showed its SERVICE
// month ("אוגוסט 2026") where an item invoice showed its ISSUE date
// ("29/06/2026") — same column, same heading, two different quantities.
// A מקדמות declaration is filed on מחזור by issue date, so #700008 (issued
// 01/09, read on the page as "אוגוסט 2026") got placed in the wrong
// bimonthly period, producing a real wrong figure (Agla composed 07-08 as
// 700008 + 700009 instead of the correct 700007-only ₪3,534.12).

describe('formatDateForDisplay', () => {
  it('converts an ISO date/datetime to DD/MM/YYYY', () => {
    expect(formatDateForDisplay('2026-09-01T00:00:00.000Z')).toBe('01/09/2026')
    expect(formatDateForDisplay('2026-07-03')).toBe('03/07/2026')
  })
})

describe('docDisplayDate', () => {
  it('shows the issue date as primary for an hourly invoice (the #700008 case)', () => {
    const doc = { transactionId: 'invoice:abc', monthName: 'אוגוסט 2026', createdAt: '2026-09-01T00:00:00.000Z' }
    const result = docDisplayDate(doc)
    expect(result.primary).toBe('01/09/2026')
    expect(result.serviceMonth).toBe('אוגוסט 2026')
  })

  it('shows the issue date as primary for an item invoice, with no service month', () => {
    const doc = { transactionId: 'invoice-items:xyz', monthName: undefined, createdAt: '2026-06-29T00:00:00.000Z' }
    const result = docDisplayDate(doc)
    expect(result.primary).toBe('29/06/2026')
    expect(result.serviceMonth).toBeUndefined()
  })

  it('shows no service month for an hourly invoice that has none recorded', () => {
    const doc = { transactionId: 'invoice:abc', monthName: undefined, createdAt: '2026-07-03T00:00:00.000Z' }
    const result = docDisplayDate(doc)
    expect(result.primary).toBe('03/07/2026')
    expect(result.serviceMonth).toBeUndefined()
  })
})
