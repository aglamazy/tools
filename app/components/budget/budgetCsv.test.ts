import { describe, it, expect } from 'vitest'
import { toCsv, subjectsCsv, transactionsCsv, monthForFilename } from './budgetCsv'
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'

const cat = (id: string, name: string, extra: Partial<Category> = {}): Category =>
  ({ id, name, color: '#000', type: 'expense', ...extra } as Category)
const categories: Category[] = [
  cat('p', 'הלוואה/מימון'),
  cat('s', 'משכנתא', { parentId: 'p' }),
  cat('o', 'מזון'),
  cat('c', 'חיסכון', { isCapital: true }),
]
let n = 0
const tx = (category: string, amount: number, extra: Partial<BudgetTransaction> = {}): BudgetTransaction =>
  ({ id: String(n++), date: '01/10/2026', business: 'b', category, amount, isFixed: false, paymentMethod: 'bank', ...extra })

const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean)

describe('toCsv (aglamazo#466)', () => {
  it('starts with a BOM, CRLF line ends', () => {
    const csv = toCsv(['a', 'b'], [[1, 'x']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toBe('﻿a,b\r\n1,x\r\n')
  })
  it('quotes commas, quotes and newlines', () => {
    expect(lines(toCsv(['h'], [['a,b'], ['say "hi"'], ['two\nlines']]))).toEqual([
      'h', '"a,b"', '"say ""hi"""', '"two\nlines"',
    ].join('\r\n').split('\r\n'))
  })
})

describe('subjectsCsv (aglamazo#466)', () => {
  it('parent total includes subs, then a row per sub; capital, income and card charges left out', () => {
    const csv = subjectsCsv([
      tx('הלוואה/מימון', -1000), tx('משכנתא', -500.555), tx('מזון', -70),
      tx('חיסכון', -9999), tx('מזון', 5000), tx('מזון', -300, { isCreditCardCharge: true }),
    ], categories)
    expect(lines(csv)).toEqual([
      'נושא,תת-נושא,סכום',
      'הלוואה/מימון,,1500.56',
      'הלוואה/מימון,משכנתא,500.56',
      'מזון,,70',
    ])
  })
})

describe('transactionsCsv (aglamazo#466)', () => {
  it('one line per row, date order, card charges out, display name used', () => {
    const csv = transactionsCsv([
      tx('מזון', -70, { date: '15/10/2026', business: 'shop, ltd', isFixed: true, installmentInfo: '2/3' }),
      tx('', 5000, { date: '02/10/2026', business: 'salary' }),
      tx('מזון', -300, { isCreditCardCharge: true }),
    ], (b) => (b === 'salary' ? 'משכורת' : b))
    expect(lines(csv)).toEqual([
      'תאריך,עסק,נושא,סכום,אמצעי תשלום,קבוע,תשלום',
      '02/10/2026,משכורת,,5000,bank,,',
      '15/10/2026,"shop, ltd",מזון,-70,bank,כן,2/3',
    ])
  })
})

describe('monthForFilename (aglamazo#466)', () => {
  it('09/2026 -> 2026-09, no slash in the file name', () => {
    expect(monthForFilename('09/2026')).toBe('2026-09')
    expect(monthForFilename('9/2026')).toBe('2026-09')
  })
})
