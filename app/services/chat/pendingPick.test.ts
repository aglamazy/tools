import { describe, it, expect } from 'vitest'
import { resolvePendingPick, type OpenPicker } from './pendingPick'

const R = (name: string) => ({ catalogId: name, name, brand: '', price: '1', unitPrice: '1 ₪/ק"ג' })
const picker = (key: string, query: string, names: string[]): OpenPicker =>
  ({ key, entry: { query, qty: 1, target: 'pending', results: names.map(R) } })

const banana = picker('b1', 'בננות', ['בננה', "בננה צ'יפס", 'בננה קפוא קילו'])
const cucumber = picker('c1', 'מלפפונים', ['מלפפון', 'מלפפון מיני זהבי, פרימיום'])
const parsley = picker('p1', 'פטרוזיליה', ['פטרוזיליה תוצרת מים', 'פטרוזיליה שורש'])

describe('resolvePendingPick (saliko#36)', () => {
  it('a typed product name picks it instead of looping', () => {
    expect(resolvePendingPick([banana], { productName: 'בננה' })).toEqual({ kind: 'pick', key: 'b1', index: 0 })
    expect(resolvePendingPick([banana, cucumber], { productName: 'מלפפון' })).toEqual({ kind: 'pick', key: 'c1', index: 0 })
  })

  it('a bare number with one picker open picks from it', () => {
    expect(resolvePendingPick([banana], { resultIndex: 3 })).toEqual({ kind: 'pick', key: 'b1', index: 2 })
  })

  it('a bare number with several pickers open is asked back, not guessed', () => {
    const r = resolvePendingPick([parsley, banana, cucumber], { resultIndex: 1 })
    expect(r.kind).toBe('ask')
  })

  it('a number with the item named lands on that picker', () => {
    expect(resolvePendingPick([parsley, banana, cucumber], { resultIndex: 1, forItem: 'פטרוזיליה' }))
      .toEqual({ kind: 'pick', key: 'p1', index: 0 })
  })

  it('an out-of-range number or unknown name is answered, not silently dropped', () => {
    expect(resolvePendingPick([banana], { resultIndex: 9 }).kind).toBe('ask')
    expect(resolvePendingPick([banana], { productName: 'אננס' }).kind).toBe('ask')
  })
})
