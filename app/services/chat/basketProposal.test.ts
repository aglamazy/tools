import { describe, it, expect, vi } from 'vitest'

vi.mock('@/app/lib/firebaseAdmin', () => ({ getAdminFirestore: () => ({}) }))

import { pickForBasket, formatProposal } from './basketProposal'

const r = (name: string, price: string, brand: string, unitPrice = `${price} ₪/ק"ג`) =>
  ({ productId: name, name, brand, price, unitPrice })

describe('basket proposal (saliko#38)', () => {
  it('a fresh basket never takes dried fruit', () => {
    const res = pickForBasket('חמוציות', [r('חמוציות ברכז תפוחים דל סוכר', '7.5', 'פירות יבשים ופיצוחים')], true)
    expect('skip' in res && res.skip).toContain('אין גרסה טרייה')
  })

  it('takes the first (fresh, cheapest) ranked option', () => {
    const res = pickForBasket('בננה', [r('בננה', '15.9', 'פירות'), r("בננה צ'יפס", '7.5', 'פירות יבשים ופיצוחים')], true)
    expect('item' in res && res.item.name).toBe('בננה')
  })

  it('shows every price and a total', () => {
    const text = formatProposal('מקור השפע', [
      { query: 'בננה', catalogId: '1', name: 'בננה', price: 15.9, unitPrice: '15.9 ₪/ק"ג' },
      { query: 'גזר', catalogId: '2', name: 'גזר', price: 8.9, unitPrice: '8.9 ₪/ק"ג' },
    ], ['"חמוציות": אין גרסה טרייה בקטלוג'])
    expect(text).toContain('בננה — 15.9 ₪/ק"ג')
    expect(text).toContain('סה"כ משוער: 24.80 ₪')
    expect(text).toContain('לא נכנסו')
  })
})
