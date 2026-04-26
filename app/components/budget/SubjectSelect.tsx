'use client'

import React from 'react'
import type { Category } from '@/app/types/category'

type HouseholdMember = { uid: string; label: string }

type Props = {
  value: string
  onChange: (next: string) => void
  /** Sign decides which subjects are listed (positive → income, negative/zero → expense). */
  amount: number
  categories: Category[]
  householdMembers?: HouseholdMember[]
  placeholder?: string
  style?: React.CSSProperties
  className?: string
  /** Skip the synthetic tax categories (ביטוח לאומי / מקדמות מס הכנסה per member). */
  skipTaxOptions?: boolean
}

/**
 * Subject dropdown shared by the budget transactions table and the smart-classifier chat.
 *
 * Resolves children by union of `parentId` and `parent.subCategories[]`, with an orphan
 * fallback for categories whose parent isn't shown — see app/(dashboard)/app/budget/page.tsx
 * history for why both paths matter (data drift between the two link directions).
 */
export default function SubjectSelect({
  value,
  onChange,
  amount,
  categories,
  householdMembers,
  placeholder = 'בחר נושא',
  style,
  className,
  skipTaxOptions,
}: Props) {
  const wantType = amount > 0 ? 'income' : 'expense'
  const parents = categories.filter((c) => !c.parentId && c.type === wantType)
  const rendered = new Set<string>()
  const items = parents.flatMap((parent) => {
    rendered.add(parent.id)
    const childMap = new Map<string, Category>()
    for (const c of categories) {
      if (c.parentId === parent.id) childMap.set(c.id, c)
    }
    for (const id of parent.subCategories || []) {
      const c = categories.find((x) => x.id === id)
      if (c) childMap.set(c.id, c)
    }
    const children = Array.from(childMap.values())
    children.forEach((c) => rendered.add(c.id))
    return [
      <option key={parent.id} value={parent.name}>{parent.name}</option>,
      ...children.map((child) => (
        <option key={child.id} value={child.name}>{'  ┘─ ' + child.name}</option>
      )),
    ]
  })
  const orphans = categories.filter(
    (c) => c.type === wantType && c.parentId && !rendered.has(c.id)
  )

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      style={style}
    >
      <option value="">{placeholder}</option>
      {!skipTaxOptions && amount < 0 && (householdMembers || []).map((m) => {
        const tag = (m.label || '').split('@')[0].split(/[\s.]+/)[0] || m.uid.slice(-4)
        return (
          <React.Fragment key={`tax-${m.uid}`}>
            <option value={`ביטוח לאומי (${tag})`}>{`ביטוח לאומי (${tag})`}</option>
            <option value={`מקדמות מס הכנסה (${tag})`}>{`מקדמות מס הכנסה (${tag})`}</option>
          </React.Fragment>
        )
      })}
      {items}
      {orphans.map((c) => (
        <option key={c.id} value={c.name}>{c.name}</option>
      ))}
    </select>
  )
}
