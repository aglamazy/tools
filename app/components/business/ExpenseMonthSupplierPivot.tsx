'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Business, type Transaction, type ExpenseDocument } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { MONTH_NAMES_HE } from '@/app/lib/dateUtils'
import { pickExpenseLabel, normalizeSupplierKey } from '@/app/utils/expenseLabel'
import { normalizeDate } from '@/app/utils/parsers/shared'
import { effectiveExpenseNetAmount, resolveBusinessExpenseCategories } from './expenseScale'
import { buildSupplierAliasMap, renameSupplierAlias } from '@/app/services/supplierService'

type Props = {
  businessId: string
  business: Business
}

type SupplierRow = {
  key: string // normalizeSupplierKey(supplier) — stable identity across a rename's re-group
  supplier: string
  byMonth: number[] // index 0 = January
  total: number
}

// Where a group's display label actually came from, so a rename (aglamazo#342)
// can write to the RIGHT place: a document's own field, or a supplier alias
// (never transaction.merchant/description directly — that's the bank's own
// record and the audit trail back to the statement).
type RenameSource =
  | { type: 'doc'; docId: number; field: 'vendor' | 'description' }
  | { type: 'alias'; rawValue: string }

// One line of the drill-down validation table under a clicked (supplier,
// month) cell — everything that summed into that cell's number, so Agla can
// check the math against his bank statement without leaving the page.
type DrillItem = {
  key: string
  date: string
  description: string
  rawAmount: number
  effectiveAmount: number // what actually counted toward this business (post %-scaling for household-deductible categories)
  month: string // MM/YYYY, for the "open in budget" link
  txId?: number
}

function resolveAlias(raw: string, aliasMap: Map<string, string>): string {
  return aliasMap.get(raw.trim().toLowerCase()) ?? raw
}

function supplierLabelForTransaction(
  t: Transaction,
  aliasMap: Map<string, string>,
  doc?: ExpenseDocument,
): { label: string; source: RenameSource } {
  const raw = pickExpenseLabel(doc?.description, doc?.vendor, t.merchant, t.description)
  if (doc?.id != null && raw === doc.description) return { label: raw, source: { type: 'doc', docId: doc.id, field: 'description' } }
  if (doc?.id != null && raw === doc.vendor) return { label: raw, source: { type: 'doc', docId: doc.id, field: 'vendor' } }
  // t.merchant or t.description won — never edit the transaction itself
  // (it's the bank's own record); group/display via a supplier alias instead.
  return { label: resolveAlias(raw, aliasMap), source: { type: 'alias', rawValue: raw } }
}

function supplierLabelForDoc(d: ExpenseDocument): { label: string; source: RenameSource } {
  const raw = d.vendor || d.fileName
  return { label: raw, source: { type: 'doc', docId: d.id!, field: 'vendor' } }
}

function getCanonicalDateParts(date?: string): { year: number; month: number } | null {
  const normalized = normalizeDate(date)
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const [year, month] = normalized.split('-')
  const yearNum = Number(year)
  const monthNum = Number(month)
  if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum)) return null
  return { year: yearNum, month: monthNum }
}

export default function ExpenseMonthSupplierPivot({ businessId, business }: Props) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [rows, setRows] = useState<SupplierRow[]>([])
  const [monthTotals, setMonthTotals] = useState<number[]>(Array(12).fill(0))
  const [loading, setLoading] = useState(true)
  const [cellItems, setCellItems] = useState<Map<string, DrillItem[]>>(new Map())
  const [drillDown, setDrillDown] = useState<{ supplier: string; monthIdx: number } | null>(null)
  const [sourcesByKey, setSourcesByKey] = useState<Map<string, RenameSource[]>>(new Map())
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const cellKey = (supplier: string, monthIdx: number) => `${supplier}|${monthIdx}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const aliasMap = await buildSupplierAliasMap()
      const allCategories = await subjectStore.getAll()
      const categories = resolveBusinessExpenseCategories(allCategories, business)
      const categoryNames = categories.map(c => c.name)
      const categoryByName = new Map(categories.map(c => [c.name, c]))

      const allTransactions = await db.transactions.toArray()
      const expenseTransactions = allTransactions
        .filter(t => t.category && categoryNames.includes(t.category) && t.amount < 0)
        .filter(t => !t.currentStep || t.currentStep === 1)

      const allPartnerDocs = await db.expenseDocuments
        .filter(d => d.businessId === businessId && !d.transactionId && !!d.paidByUid)
        .toArray()

      const txSyncIds = expenseTransactions.map(t => t.syncId).filter((id): id is string => id != null)
      const linkedDocs = await db.expenseDocuments.where('transactionId').anyOf(txSyncIds).toArray()
      const firstDocByTxId = new Map<string, ExpenseDocument>()
      for (const doc of linkedDocs) {
        if (doc.transactionId && !firstDocByTxId.has(doc.transactionId)) {
          firstDocByTxId.set(doc.transactionId, doc)
        }
      }

      // Years available across all matching data, for the year selector.
      const years = new Set<number>()
      for (const t of expenseTransactions) years.add(Number(t.month.split('/')[1]))
      for (const d of allPartnerDocs) {
        const parts = getCanonicalDateParts(d.date)
        if (parts) years.add(parts.year)
      }
      years.add(currentYear)

      // Grouped on a normalized key (case/whitespace/leading-dot insensitive,
      // aglamazo#341) so ".VERCEL INC", "Vercel Inc." and "VERCEL INC." land
      // in one row instead of three. The displayed label is decided after
      // the loop, from whichever raw variant occurred most often.
      const byYearMonth = new Map<string, Map<number, number>>() // normalizedKey -> monthIdx -> sum
      const itemsByKey = new Map<string, Map<number, DrillItem[]>>() // normalizedKey -> monthIdx -> validation rows
      const labelCounts = new Map<string, Map<string, number>>() // normalizedKey -> raw label -> occurrences
      const sourcesMap = new Map<string, RenameSource[]>() // normalizedKey -> where each contributing label came from
      const addAmount = (rawSupplier: string, monthIdx: number, y: number, amount: number, item: DrillItem, source: RenameSource) => {
        if (y !== year) return
        const key = normalizeSupplierKey(rawSupplier)
        if (!byYearMonth.has(key)) byYearMonth.set(key, new Map())
        const m = byYearMonth.get(key)!
        m.set(monthIdx, (m.get(monthIdx) || 0) + amount)
        if (!itemsByKey.has(key)) itemsByKey.set(key, new Map())
        const monthItems = itemsByKey.get(key)!
        const existing = monthItems.get(monthIdx) || []
        existing.push(item)
        monthItems.set(monthIdx, existing)
        if (!labelCounts.has(key)) labelCounts.set(key, new Map())
        const counts = labelCounts.get(key)!
        counts.set(rawSupplier, (counts.get(rawSupplier) || 0) + 1)
        if (!sourcesMap.has(key)) sourcesMap.set(key, [])
        sourcesMap.get(key)!.push(source)
      }

      for (const t of expenseTransactions) {
        // Installment purchases use the full purchase amount, same as
        // everywhere else this pivot's month-column figures come from.
        const fullAmount = t.totalSteps && t.totalSteps > 1
          ? (t.totalAmount || t.totalSteps * Math.abs(t.amount))
          : Math.abs(t.amount)
        const matchedDoc = t.syncId != null ? firstDocByTxId.get(t.syncId) : undefined
        // Net (excl. VAT), aglamazo#345: the bank ILS amount minus the
        // matched document's own extracted VAT — never doc.amount as the
        // base, since a foreign-currency invoice is denominated in USD
        // while the bank charged ILS (Sheli, 2026-09-08). Also scales
        // household-deductible categories down to this owner's percentage,
        // same as effectiveExpenseAmount did.
        const amount = effectiveExpenseNetAmount({ ...t, amount: -fullAmount }, business, categoryByName, matchedDoc?.vatAmount)
        if (amount <= 0) continue
        const monthNum = Number(t.month.split('/')[0])
        const y = Number(t.month.split('/')[1])
        const { label: supplier, source } = supplierLabelForTransaction(t, aliasMap, matchedDoc)
        addAmount(supplier, monthNum - 1, y, amount, {
          key: `tx-${t.id}`,
          date: t.date,
          description: t.description || t.merchant || supplier,
          rawAmount: fullAmount,
          effectiveAmount: amount,
          month: t.month,
          txId: t.id,
        }, source)
      }

      for (const d of allPartnerDocs) {
        const parts = getCanonicalDateParts(d.date)
        if (!parts) continue
        const { year: y, month: monthNum } = parts
        const { label: supplier, source } = supplierLabelForDoc(d)
        // Net here too — no separate bank leg to defer to for a partner-paid
        // doc, so the document's own amount/vatAmount are both authoritative.
        const amount = Math.max(0, Math.abs(d.amount || 0) - Math.abs(d.vatAmount || 0))
        addAmount(supplier, monthNum - 1, y, amount, {
          key: `doc-${d.id}`,
          date: d.date || '',
          description: `${d.vendor || d.fileName} (חשבונית ששולמה ע״י שותף)`,
          rawAmount: amount,
          effectiveAmount: amount,
          month: `${String(monthNum).padStart(2, '0')}/${y}`,
        }, source)
      }

      // Most-frequent raw variant wins as the display label; ties broken by
      // length (favors the fuller string, e.g. "Vercel Inc." over "VERCEL").
      const displayLabelFor = (key: string): string => {
        const counts = labelCounts.get(key)
        let best: string | null = null
        let bestCount = -1
        for (const [label, count] of counts ?? []) {
          if (count > bestCount || (count === bestCount && (best === null || label.length > best.length))) {
            best = label
            bestCount = count
          }
        }
        return best ?? key
      }

      const built: SupplierRow[] = Array.from(byYearMonth.entries()).map(([key, monthMap]) => {
        const byMonth = Array.from({ length: 12 }, (_, i) => monthMap.get(i) || 0)
        return { key, supplier: displayLabelFor(key), byMonth, total: byMonth.reduce((s, v) => s + v, 0) }
      }).sort((a, b) => b.total - a.total)

      const totals = Array.from({ length: 12 }, (_, i) => built.reduce((s, r) => s + r.byMonth[i], 0))

      const items = new Map<string, DrillItem[]>()
      for (const [key, monthMap] of itemsByKey) {
        const displayLabel = displayLabelFor(key)
        for (const [monthIdx, list] of monthMap) {
          list.sort((a, b) => a.date.localeCompare(b.date))
          items.set(cellKey(displayLabel, monthIdx), list)
        }
      }

      if (cancelled) return
      setAvailableYears(Array.from(years).sort((a, b) => b - a))
      setRows(built)
      setMonthTotals(totals)
      setCellItems(items)
      setSourcesByKey(sourcesMap)
      setDrillDown(null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [businessId, business, year, currentYear, reloadTick])

  const grandTotal = useMemo(() => monthTotals.reduce((s, v) => s + v, 0), [monthTotals])

  // aglamazo#342 — a rename must reach BOTH sources that can feed a group's
  // label or it'll look like it worked and then not merge: a document's own
  // field, or (for a merchant/description-only row) a supplier alias. Never
  // writes to transaction.merchant/description directly.
  const handleRename = async (key: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) { setEditingKey(null); return }
    const sources = sourcesByKey.get(key) || []
    setRenaming(true)
    try {
      const seenDocFields = new Set<string>()
      const seenAliases = new Set<string>()
      for (const source of sources) {
        if (source.type === 'doc') {
          const dedupeKey = `${source.docId}:${source.field}`
          if (seenDocFields.has(dedupeKey)) continue
          seenDocFields.add(dedupeKey)
          await db.expenseDocuments.update(
            source.docId,
            source.field === 'vendor' ? { vendor: trimmed } : { description: trimmed },
          )
        } else {
          if (seenAliases.has(source.rawValue)) continue
          seenAliases.add(source.rawValue)
          await renameSupplierAlias(source.rawValue, trimmed)
        }
      }
      setEditingKey(null)
      setReloadTick(t => t + 1)
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <label style={{ fontWeight: 600 }}>שנה:</label>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '1rem', direction: 'rtl' }}
        >
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {/* aglamazo#345: all amounts below are net of VAT — stated once here
            rather than annotating every סה״כ cell in the table. */}
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>הסכומים בטבלה נטו, ללא מע״מ</span>
      </div>

      {loading ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem' }}>טוען...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>אין הוצאות בשנה זו</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', position: 'sticky', right: 0, background: '#fff' }}>ספק</th>
                {MONTH_NAMES_HE.map(m => (
                  <th key={m} style={{ padding: '0.6rem 0.4rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{m}</th>
                ))}
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 700 }}>סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.5rem', position: 'sticky', right: 0, background: '#fff', whiteSpace: 'nowrap' }}>
                    {editingKey === row.key ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input
                          autoFocus
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRename(row.key, editingValue)
                            if (e.key === 'Escape') setEditingKey(null)
                          }}
                          disabled={renaming}
                          style={{ padding: '0.2rem 0.4rem', border: '1px solid #93c5fd', borderRadius: '0.25rem', fontSize: '0.85rem', width: '10rem' }}
                        />
                        <button
                          onClick={() => handleRename(row.key, editingValue)}
                          disabled={renaming}
                          title="שמור"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}
                        >✓</button>
                        <button
                          onClick={() => setEditingKey(null)}
                          disabled={renaming}
                          title="בטל"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                        >✕</button>
                      </div>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        {row.supplier}
                        <button
                          onClick={() => { setEditingKey(row.key); setEditingValue(row.supplier) }}
                          title="שנה שם ספק — ימזג שורות עם אותו שם"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.75rem', padding: 0 }}
                        >✎</button>
                      </span>
                    )}
                  </td>
                  {row.byMonth.map((amount, i) => {
                    const isActive = drillDown?.supplier === row.supplier && drillDown?.monthIdx === i
                    return (
                    <td
                      key={i}
                      style={{
                        padding: '0.5rem 0.4rem',
                        textAlign: 'center',
                        color: amount ? '#0f172a' : '#cbd5e1',
                        background: isActive ? '#dbeafe' : amount ? '#eff6ff' : 'transparent',
                      }}
                    >
                      {amount ? (
                        <button
                          onClick={() => setDrillDown(prev =>
                            prev?.supplier === row.supplier && prev?.monthIdx === i ? null : { supplier: row.supplier, monthIdx: i }
                          )}
                          title="לחץ לפירוט התנועות שמרכיבות סכום זה"
                          style={{
                            background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer',
                            color: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted',
                          }}
                        >
                          {amount.toLocaleString()}
                        </button>
                      ) : '—'}
                    </td>
                    )
                  })}
                  <td style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>₪{row.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                <td style={{ padding: '0.6rem 0.5rem', position: 'sticky', right: 0, background: '#fff' }}>סה״כ</td>
                {monthTotals.map((t, i) => (
                  <td key={i} style={{ padding: '0.6rem 0.4rem', textAlign: 'center' }}>{t ? t.toLocaleString() : '—'}</td>
                ))}
                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>₪{grandTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {drillDown && (() => {
        const items = cellItems.get(cellKey(drillDown.supplier, drillDown.monthIdx)) || []
        const total = items.reduce((s, it) => s + it.effectiveAmount, 0)
        const anyScaled = items.some(it => Math.abs(it.effectiveAmount - it.rawAmount) > 0.01)
        return (
          <div style={{ border: '1px solid #bfdbfe', background: '#f8fafc', borderRadius: '0.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                {drillDown.supplier} — {MONTH_NAMES_HE[drillDown.monthIdx]} {year}
              </h4>
              <button
                onClick={() => setDrillDown(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
              >
                סגור
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>תאריך</th>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>תיאור</th>
                  {anyScaled && <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>סכום גולמי</th>}
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>{anyScaled ? 'נכלל בעסק' : 'סכום'}</th>
                  <th style={{ padding: '0.4rem 0.5rem' }} />
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.4rem 0.5rem', whiteSpace: 'nowrap' }}>{it.date}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{it.description}</td>
                    {anyScaled && (
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', color: '#94a3b8' }}>
                        {it.rawAmount.toLocaleString()}
                      </td>
                    )}
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', fontWeight: 500 }}>
                      {it.effectiveAmount.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', whiteSpace: 'nowrap' }}>
                      {it.txId != null && (
                        <a
                          href={`/app/budget?month=${encodeURIComponent(it.month)}&tx=${it.txId}#tx-${it.txId}`}
                          title="פתח בעמוד התקציב לתנועה זו"
                          style={{ color: '#2563eb', fontSize: '0.8rem', textDecoration: 'none' }}
                        >
                          פתח ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                  <td colSpan={anyScaled ? 3 : 2} style={{ padding: '0.5rem' }}>סה״כ</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>₪{total.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )
      })()}
    </div>
  )
}
