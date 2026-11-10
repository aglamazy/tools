import type { Category } from '@/app/types/category'

/**
 * Pure data side of SubjectSelect (aglamazo#469): which subjects are offered, how they group,
 * and which rows are visible for a given search / open-groups / recent state. Kept free of
 * React and the DOM so it is unit-tested directly.
 */

export type HouseholdMember = { uid: string; label: string }

export type SubjectGroup = { name: string; children: string[] }

export type SubjectTree = {
  groups: SubjectGroup[] // parents (and orphans, as childless groups) in display order
  taxOptions: string[]
}

export type PickerRow =
  | { kind: 'heading'; label: string }
  | {
      kind: 'option'
      value: string
      /** Parent name for a child row; null for a parent / flat row. */
      parent: string | null
      level: 0 | 1
      /** Group has children (a parent row that can fold). */
      foldable: boolean
      expanded: boolean
      childCount: number
      /** Parent shown only because one of its children matched the search. */
      context: boolean
    }

export const RECENT_LIMIT = 5

export const HEADING_RECENT = 'אחרונים'
export const HEADING_ALL = 'כל הנושאים'
export const HEADING_TAX = 'מסים'

/** Label of the row that clears the subject (emits ""), as the old select's empty option did. */
export const CLEAR_LABEL = 'ללא נושא'

/**
 * Same resolution as the old dropdown: children are the union of `parentId` and
 * `parent.subCategories[]` (the two link directions drift), plus an orphan fallback for
 * children whose parent isn't listed.
 */
export function buildSubjectTree(
  categories: Category[],
  amount: number,
  householdMembers: HouseholdMember[] = [],
  skipTaxOptions = false
): SubjectTree {
  const wantType = amount > 0 ? 'income' : 'expense'
  const parents = categories.filter((c) => !c.parentId && c.type === wantType)
  const rendered = new Set<string>()
  const childIds = new Set<string>()
  const built = parents.map((parent) => {
    rendered.add(parent.id)
    const childMap = new Map<string, Category>()
    for (const c of categories) {
      if (c.parentId === parent.id) childMap.set(c.id, c)
    }
    for (const id of parent.subCategories || []) {
      const c = categories.find((x) => x.id === id)
      if (c && c.id !== parent.id) childMap.set(c.id, c)
    }
    const children = Array.from(childMap.values())
    children.forEach((c) => {
      rendered.add(c.id)
      childIds.add(c.id)
    })
    return { id: parent.id, group: { name: parent.name, children: children.map((c) => c.name) } }
  })
  // A parent-less category linked only through another parent's subCategories[] shows once,
  // under that parent, not a second time as its own top-level group.
  const groups: SubjectGroup[] = built.filter((b) => !childIds.has(b.id)).map((b) => b.group)
  for (const c of categories) {
    if (c.type === wantType && c.parentId && !rendered.has(c.id)) {
      groups.push({ name: c.name, children: [] })
    }
  }
  const taxOptions: string[] = []
  if (!skipTaxOptions && amount < 0) {
    for (const m of householdMembers) {
      const tag = (m.label || '').split('@')[0].split(/[\s.]+/)[0] || m.uid.slice(-4)
      taxOptions.push(`ביטוח לאומי (${tag})`, `מקדמות מס הכנסה (${tag})`)
    }
  }
  return { groups, taxOptions }
}

/** Parent of a child subject, or null for a parent / flat / unknown value. */
export function parentOf(tree: SubjectTree, value: string): string | null {
  if (!value) return null
  for (const g of tree.groups) {
    if (g.name === value) return null
  }
  for (const g of tree.groups) {
    if (g.children.includes(value)) return g.name
  }
  return null
}

/** Every pickable value in the tree. */
export function allValues(tree: SubjectTree): Set<string> {
  const s = new Set<string>(tree.taxOptions)
  for (const g of tree.groups) {
    s.add(g.name)
    g.children.forEach((c) => s.add(c))
  }
  return s
}

export const normalize = (s: string) => s.trim().toLowerCase()

export function matches(text: string, query: string): boolean {
  const q = normalize(query)
  return !q || text.toLowerCase().includes(q)
}

/**
 * The rows the open picker shows.
 * - No query: Recent (if any), then all groups — folded unless in `openGroups` — then tax lines.
 * - Query: groups whose name or any child matches. A parent match shows all its children; a
 *   child-only match shows only the matching children, under the parent marked `context`.
 */
export function visibleRows(
  tree: SubjectTree,
  query: string,
  openGroups: ReadonlySet<string>,
  recent: string[],
  /** Offer a first row that clears the subject (value ""), shown only while nothing is typed. */
  clearable = false
): PickerRow[] {
  const q = normalize(query)
  const rows: PickerRow[] = []
  if (!q && clearable) {
    rows.push({ kind: 'option', value: '', parent: null, level: 0, foldable: false, expanded: false, childCount: 0, context: false })
  }
  if (!q) {
    const known = allValues(tree)
    const rec = recent.filter((v) => known.has(v)).slice(0, RECENT_LIMIT)
    if (rec.length) {
      rows.push({ kind: 'heading', label: HEADING_RECENT })
      for (const v of rec) {
        rows.push({ kind: 'option', value: v, parent: parentOf(tree, v), level: 0, foldable: false, expanded: false, childCount: 0, context: false })
      }
    }
  }
  const groupRows: PickerRow[] = []
  for (const g of tree.groups) {
    const parentHit = matches(g.name, q)
    const kids = q && !parentHit ? g.children.filter((c) => matches(c, q)) : g.children
    if (q && !parentHit && kids.length === 0) continue
    const expanded = q ? kids.length > 0 : openGroups.has(g.name)
    groupRows.push({
      kind: 'option',
      value: g.name,
      parent: null,
      level: 0,
      foldable: g.children.length > 0,
      expanded,
      childCount: g.children.length,
      context: !!q && !parentHit,
    })
    if (expanded) {
      for (const c of kids) {
        groupRows.push({ kind: 'option', value: c, parent: g.name, level: 1, foldable: false, expanded: false, childCount: 0, context: false })
      }
    }
  }
  if (groupRows.length) rows.push({ kind: 'heading', label: HEADING_ALL }, ...groupRows)
  const tax = tree.taxOptions.filter((t) => matches(t, q))
  if (tax.length) {
    rows.push({ kind: 'heading', label: HEADING_TAX })
    for (const t of tax) {
      rows.push({ kind: 'option', value: t, parent: null, level: 0, foldable: false, expanded: false, childCount: 0, context: false })
    }
  }
  return rows
}

/** Index of the row the keyboard cursor starts on: the first real match when searching. */
export function initialActive(rows: PickerRow[], query: string, current = ''): number {
  const q = normalize(query)
  // With nothing typed, start on the current value (as the native select kept it on Enter).
  if (!q && current) {
    const cur = rows.findIndex((r) => r.kind === 'option' && r.value === current)
    // A value with no row (legacy, or the other sign's subject): no cursor, so Enter can't
    // overwrite it until an arrow key picks a row.
    return cur
  }
  // Never start on the clear row: open + Enter must not wipe the subject.
  return rows.findIndex((r) => r.kind === 'option' && r.value !== '' && (!q || !r.context))
}

/** Next selectable (option) row from `from`, moving by `step` (+1/-1); stays put at the ends. */
export function stepActive(rows: PickerRow[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < rows.length; i += step) {
    if (rows[i].kind === 'option') return i
  }
  return from
}

export function pushRecent(recent: string[], value: string): string[] {
  return [value, ...recent.filter((v) => v !== value)].slice(0, RECENT_LIMIT)
}
