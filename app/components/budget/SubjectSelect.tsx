'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Category } from '@/app/types/category'
import {
  buildSubjectTree,
  CLEAR_LABEL,
  initialActive,
  parentOf,
  pushRecent,
  stepActive,
  visibleRows,
  type HouseholdMember,
  type PickerRow,
} from './subjectTree'

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

// Recent picks live in memory for the page session, shared by every picker on the page.
// Never localStorage: the project keeps no app state there (CLAUDE.md), and a per-browser
// list would show one person's picks to the next on a shared device.
let sessionRecent: string[] = []
const readRecent = (): string[] => sessionRecent
const writeRecent = (list: string[]) => {
  sessionRecent = list
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  const i = q ? text.toLowerCase().indexOf(q) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: '#fde68a', color: 'inherit', borderRadius: 2, padding: 0 }}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

/**
 * Subject picker shared by the budget transactions table, the smart-classifier chat and the
 * supplier history modal (aglamazo#469): type to search, sub-subjects shown as an indented
 * tree under their parent, groups that fold, and a "Recent" group (page session only). The value is the subject
 * name, as before. Data rules live in ./subjectTree.ts.
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
  const tree = useMemo(
    () => buildSubjectTree(categories, amount, householdMembers, skipTaxOptions),
    [categories, amount, householdMembers, skipTaxOptions]
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [recent, setRecent] = useState<string[]>([])
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const rows: PickerRow[] = useMemo(
    () => (open ? visibleRows(tree, query, openGroups, recent, !!value) : []),
    [open, tree, query, openGroups, recent, value]
  )

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(Math.max(r.width, 260), window.innerWidth - 16)
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const flipUp = below < 220 && above > below
    const maxHeight = Math.min(380, flipUp ? above : below)
    // RTL page: line the popup's right edge up with the trigger's, kept on screen.
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
    const top = flipUp ? r.top - 4 - maxHeight : r.bottom + 4
    setPos({ top, left, width, maxHeight })
  }, [])

  const openPicker = () => {
    const p = parentOf(tree, value)
    setOpenGroups(p ? new Set([p]) : new Set())
    setRecent(readRecent())
    setQuery('')
    place()
    setOpen(true)
  }

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])

  const choose = (v: string) => {
    if (v) {
      const next = pushRecent(readRecent(), v)
      writeRecent(next)
      setRecent(next)
    }
    close(true)
    if (v !== value) onChange(v)
  }

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => {
      const s = new Set(prev)
      if (s.has(name)) s.delete(name)
      else s.add(name)
      return s
    })
  }

  // The cursor starts on the first real match whenever the picker opens or the search changes.
  useEffect(() => {
    if (open) setActive(initialActive(rows, query))
  }, [open, query]) // not on `rows`: folding a group must not move the cursor

  useLayoutEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close(false)
    }
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return
      place()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close, place])

  useEffect(() => {
    if (!open || active < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = rows[active]
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(active < 0 ? initialActive(rows, '') : stepActive(rows, active, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(stepActive(rows, active, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (r && r.kind === 'option') choose(r.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') {
      close(false)
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !query.trim() && r?.kind === 'option' && r.foldable) {
      // RTL: left moves into the group (opens it), right closes it.
      e.preventDefault()
      const wantOpen = e.key === 'ArrowLeft'
      if (wantOpen !== r.expanded) toggleGroup(r.value)
    }
  }

  const parent = parentOf(tree, value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : openPicker())}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.4rem',
          minWidth: '8rem',
          maxWidth: '100%',
          textAlign: 'right',
          direction: 'rtl',
          font: 'inherit',
          background: '#fff',
          color: 'inherit',
          cursor: 'pointer',
          ...style,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {value ? (
            <>
              {parent && <span style={{ color: '#64748b' }}>{parent} › </span>}
              {value}
            </>
          ) : (
            <span style={{ color: '#94a3b8' }}>{placeholder}</span>
          )}
        </span>
        <span aria-hidden="true" style={{ color: '#94a3b8', fontSize: '0.75em', flex: 'none' }}>▾</span>
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            dir="rtl"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              background: '#fff',
              color: '#1e293b',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
              fontSize: '0.875rem',
              overflow: 'hidden',
            }}
          >
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="הקלד לחיפוש…"
              aria-label="חיפוש נושא"
              autoComplete="off"
              style={{
                border: 0,
                borderBottom: '1px solid #e2e8f0',
                padding: '0.55rem 0.75rem',
                font: 'inherit',
                outline: 'none',
                background: '#fff',
                color: 'inherit',
              }}
            />
            <div ref={listRef} role="listbox" style={{ overflowY: 'auto', padding: '0.25rem 0' }} onMouseDown={(e) => e.preventDefault()}>
              {rows.length === 0 && (
                <div style={{ padding: '0.75rem', color: '#64748b' }}>אין נושא שמתאים ל&quot;{query.trim()}&quot;</div>
              )}
              {rows.map((r, i) => {
                if (r.kind === 'heading') {
                  return (
                    <div key={`h-${r.label}`} style={{ padding: '0.5rem 0.75rem 0.15rem', fontSize: '0.7rem', letterSpacing: '0.05em', color: '#64748b' }}>
                      {r.label}
                    </div>
                  )
                }
                const selected = r.value === value
                return (
                  <div
                    key={`${i}-${r.parent ?? ''}-${r.value}`}
                    data-row={i}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(r.value)}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: r.level === 1 ? '0.3rem 2.1rem 0.3rem 0.75rem' : '0.35rem 0.75rem',
                      fontWeight: r.foldable ? 700 : r.level === 0 && !r.parent ? 600 : 400,
                      fontSize: r.level === 1 ? '0.84rem' : undefined,
                      color: r.context ? '#94a3b8' : undefined,
                      background: i === active ? '#e0f2fe' : undefined,
                      cursor: 'pointer',
                    }}
                  >
                    {r.level === 1 && (
                      <span aria-hidden="true" style={{ position: 'absolute', right: '1.2rem', top: 0, bottom: 0, borderRight: '1px solid #cbd5e1' }} />
                    )}
                    {r.level === 0 && (
                      <span
                        data-fold={r.foldable ? r.value : undefined}
                        aria-hidden="true"
                        onClick={(e) => {
                          if (!r.foldable || query.trim()) return
                          e.stopPropagation()
                          setActive(i)
                          toggleGroup(r.value)
                        }}
                        style={{ width: '1rem', flex: 'none', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}
                      >
                        {r.foldable ? (r.expanded ? '▾' : '▸') : ''}
                      </span>
                    )}
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.parent && r.level === 0 && <span style={{ color: '#64748b', fontWeight: 400 }}>{r.parent} › </span>}
                      {r.value === '' ? (
                        <span style={{ color: '#64748b', fontWeight: 400 }}>{CLEAR_LABEL}</span>
                      ) : (
                        <Highlight text={r.value} query={query} />
                      )}
                      {r.foldable && !r.expanded && (
                        <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.75rem' }}> ({r.childCount})</span>
                      )}
                    </span>
                    {selected && <span style={{ marginRight: 'auto', color: '#0369a1', fontWeight: 700 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
