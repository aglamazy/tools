import { describe, it, expect } from 'vitest'
import type { Category } from '@/app/types/category'
import { expandSelectedCategories, matchesSelectedCategories } from './expandSelectedCategories'

const cat = (id: string, name: string, parentId?: string): Category => ({
  id, name, parentId, type: 'expense', color: '#000', createdAt: '2026-01-01',
})

const categories: Category[] = [
  cat('p1', 'הלוואה/מימון'),
  cat('s1', 'כל מטרה', 'p1'),
  cat('s2', 'היוון', 'p1'),
  cat('p2', 'רכב'),
  cat('s3', 'דלק', 'p2'),
  cat('x', 'מזון'),
]

describe('expandSelectedCategories', () => {
  it('adds both sub-topics of a selected parent', () => {
    expect(expandSelectedCategories(new Set(['הלוואה/מימון']), categories))
      .toEqual(new Set(['הלוואה/מימון', 'כל מטרה', 'היוון']))
  })

  it('leaves a topic without sub-topics unchanged', () => {
    expect(expandSelectedCategories(new Set(['מזון']), categories)).toEqual(new Set(['מזון']))
  })

  it('unions the families of two selected parents', () => {
    expect(expandSelectedCategories(new Set(['הלוואה/מימון', 'רכב']), categories))
      .toEqual(new Set(['הלוואה/מימון', 'כל מטרה', 'היוון', 'רכב', 'דלק']))
  })

  it('a selected sub-topic stays alone (its parent is not added)', () => {
    expect(expandSelectedCategories(new Set(['היוון']), categories)).toEqual(new Set(['היוון']))
  })

  it('an empty selection gives an empty set', () => {
    expect(expandSelectedCategories(new Set(), categories)).toEqual(new Set())
  })

  it('passes unknown names through', () => {
    expect(expandSelectedCategories(new Set(['לא קיים']), categories)).toEqual(new Set(['לא קיים']))
  })

  it('keeps all 5 sub-topic rows of the parent and they sum to the card total', () => {
    const rows = [
      { category: 'כל מטרה', amount: -1649.02 },
      { category: 'כל מטרה', amount: -2257.54 },
      { category: 'היוון', amount: -1774.13 },
      { category: 'היוון', amount: -867.19 },
      { category: 'היוון', amount: -3504.29 },
      { category: 'מזון', amount: -500 },
      { category: undefined, amount: -42 },
    ]
    const expanded = expandSelectedCategories(new Set(['הלוואה/מימון']), categories)
    const kept = rows.filter((r) => matchesSelectedCategories(r.category, expanded))
    expect(kept).toHaveLength(5)
    const sum = kept.reduce((s, r) => s + Math.abs(r.amount), 0)
    expect(sum).toBeCloseTo(10052.17, 2)
  })
})

describe('selecting the Other line (aglamazo#467)', () => {
  const sel = new Set(['ללא נושא'])
  it('shows rows with no subject or an unknown subject, not known ones', () => {
    expect(matchesSelectedCategories('', sel, categories)).toBe(true)
    expect(matchesSelectedCategories(undefined, sel, categories)).toBe(true)
    expect(matchesSelectedCategories('לא קיים', sel, categories)).toBe(true)
    expect(matchesSelectedCategories('הלוואה/מימון', sel, categories)).toBe(false)
  })
})
