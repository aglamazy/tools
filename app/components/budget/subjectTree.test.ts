import { describe, it, expect } from 'vitest'
import type { Category } from '@/app/types/category'
import {
  buildSubjectTree,
  initialActive,
  parentOf,
  pushRecent,
  stepActive,
  visibleRows,
  HEADING_ALL,
  HEADING_RECENT,
  HEADING_TAX,
  CLEAR_LABEL,
  type PickerRow,
} from './subjectTree'

const cat = (id: string, name: string, extra: Partial<Category> = {}): Category =>
  ({ id, name, type: 'expense', ...extra }) as Category

// רכב has דלק by parentId and חניה only via subCategories[] (the two link directions drift).
const categories: Category[] = [
  cat('car', 'רכב', { subCategories: ['park'] }),
  cat('fuel', 'דלק', { parentId: 'car' }),
  cat('park', 'חניה'),
  cat('food', 'מזון'),
  cat('super', 'סופרמרקט', { parentId: 'food' }),
  cat('bills', 'חשבונות'),
  cat('elec', 'חשמל', { parentId: 'bills' }),
  cat('lost', 'יתום', { parentId: 'gone' }),
  cat('salary', 'משכורת', { type: 'income' }),
]
const members = [{ uid: 'u1', label: 'agla@example.com' }]
const tree = buildSubjectTree(categories, -100, members)

const options = (rows: PickerRow[]) =>
  rows.flatMap((r) => (r.kind === 'option' ? [`${r.level ? '  ' : ''}${r.value}${r.context ? '*' : ''}`] : [`# ${r.label}`]))

describe('subject tree (aglamazo#469)', () => {
  it('groups children by parentId and subCategories, keeps orphans, filters by sign', () => {
    expect(tree.groups).toEqual([
      { name: 'רכב', children: ['דלק', 'חניה'] },
      { name: 'מזון', children: ['סופרמרקט'] },
      { name: 'חשבונות', children: ['חשמל'] },
      { name: 'יתום', children: [] },
    ])
    expect(buildSubjectTree(categories, 50).groups.map((g) => g.name)).toEqual(['משכורת'])
  })

  it('tax lines per member, only for expenses and not when skipped', () => {
    expect(tree.taxOptions).toEqual(['ביטוח לאומי (agla)', 'מקדמות מס הכנסה (agla)'])
    expect(buildSubjectTree(categories, -1, members, true).taxOptions).toEqual([])
    expect(buildSubjectTree(categories, 1, members).taxOptions).toEqual([])
  })

  it('parentOf gives the parent for a child, null otherwise', () => {
    expect(parentOf(tree, 'דלק')).toBe('רכב')
    expect(parentOf(tree, 'רכב')).toBeNull()
    expect(parentOf(tree, 'לא קיים')).toBeNull()
  })
})

describe('visible rows (aglamazo#469)', () => {
  it('empty search: groups folded, tax group at the bottom', () => {
    expect(options(visibleRows(tree, '', new Set(), []))).toEqual([
      `# ${HEADING_ALL}`, 'רכב', 'מזון', 'חשבונות', 'יתום',
      `# ${HEADING_TAX}`, 'ביטוח לאומי (agla)', 'מקדמות מס הכנסה (agla)',
    ])
  })

  it('an open group shows its children indented', () => {
    const rows = visibleRows(tree, '', new Set(['רכב']), [])
    expect(options(rows).slice(0, 5)).toEqual([`# ${HEADING_ALL}`, 'רכב', '  דלק', '  חניה', 'מזון'])
    const fuel = rows.find((r) => r.kind === 'option' && r.value === 'דלק')
    expect(fuel).toMatchObject({ parent: 'רכב', level: 1 })
  })

  it('recent group on top, last 5, drops values not offered here', () => {
    const rows = visibleRows(tree, '', new Set(), ['דלק', 'משכורת', 'מזון'])
    expect(options(rows).slice(0, 3)).toEqual([`# ${HEADING_RECENT}`, 'דלק', 'מזון'])
    expect(rows[1]).toMatchObject({ value: 'דלק', parent: 'רכב' })
  })

  it('search on a child keeps its parent as greyed context, only matching children', () => {
    expect(options(visibleRows(tree, 'דל', new Set(), ['דלק']))).toEqual([`# ${HEADING_ALL}`, 'רכב*', '  דלק'])
  })

  it('search on a parent shows all its children', () => {
    expect(options(visibleRows(tree, 'רכב', new Set(), []))).toEqual([`# ${HEADING_ALL}`, 'רכב', '  דלק', '  חניה'])
  })

  it('search reaches tax lines; no match gives no rows', () => {
    expect(options(visibleRows(tree, 'לאומי', new Set(), []))).toEqual([`# ${HEADING_TAX}`, 'ביטוח לאומי (agla)'])
    expect(visibleRows(tree, 'zzz', new Set(), [])).toEqual([])
  })

  it('cursor starts on the first real match and steps over headings', () => {
    const rows = visibleRows(tree, 'דל', new Set(), [])
    expect(initialActive(rows, 'דל')).toBe(2) // דלק, not the context parent רכב
    const all = visibleRows(tree, '', new Set(), [])
    expect(initialActive(all, '')).toBe(1)
    expect(stepActive(all, 4, 1)).toBe(6) // skips the tax heading
    expect(stepActive(all, 1, -1)).toBe(1) // stays at the top
  })

  it('pushRecent moves a value to the front and keeps 5', () => {
    expect(pushRecent(['a', 'b', 'c', 'd', 'e'], 'c')).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(pushRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd'])
  })

  it('clearable: a first row with value "" clears the subject, hidden while typing (old select empty option)', () => {
    const rows = visibleRows(tree, '', new Set(), [], true)
    expect(rows[0]).toMatchObject({ kind: 'option', value: '', parent: null })
    expect(initialActive(rows, '')).not.toBe(0) // never starts on the clear row
    expect(rows[initialActive(rows, '')]).toMatchObject({ value: 'רכב' })
    expect(visibleRows(tree, 'דל', new Set(), [], true).some((r) => r.kind === 'option' && r.value === '')).toBe(false)
    expect(visibleRows(tree, '', new Set(), []).some((r) => r.kind === 'option' && r.value === '')).toBe(false)
    expect(CLEAR_LABEL).toBe('ללא נושא')
  })

  it('opening a filled picker starts on the current value, so Enter keeps it (113540)', () => {
    const rows = visibleRows(tree, '', new Set(['רכב']), ['מזון'], true)
    expect(rows[initialActive(rows, '', 'דלק')]).toMatchObject({ value: 'דלק', parent: 'רכב' })
    expect(rows[0]).toMatchObject({ value: '' })
    // a value with no row (legacy / other sign): no cursor, so Enter does nothing (113549)
    const folded = visibleRows(tree, '', new Set(), [], true)
    expect(initialActive(folded, '', 'ישן')).toBe(-1)
    // and the first ArrowDown lands on the first real option, never the clear row
    expect(folded[initialActive(folded, '')]).toMatchObject({ value: 'רכב' })
  })

  it('a value with no row (legacy or other-sign subject) gets no cursor, so open + Enter keeps it (113549)', () => {
    const rows = visibleRows(tree, '', new Set(), ['דלק'], true)
    expect(initialActive(rows, '', 'נושא ישן')).toBe(-1)
    expect(initialActive(rows, '', 'משכורת')).toBe(-1) // an income subject on an expense row
    // ArrowDown from no cursor uses initialActive(rows, query): first real option, not the clear row
    expect(rows[initialActive(rows, '')]).toMatchObject({ kind: 'option', value: 'דלק' })
    expect(rows[initialActive(rows, '')]).not.toMatchObject({ value: '' })
  })
})
