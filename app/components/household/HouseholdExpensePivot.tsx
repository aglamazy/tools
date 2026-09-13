'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Transaction, type ExpenseDocument } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { MONTH_NAMES_HE } from '@/app/lib/dateUtils'
import {
  householdExpenseNetAmount,
  resolveHouseholdExpenseCategories,
  resolveTopLevelCategoryName,
} from '@/app/components/business/expenseScale'
import type { Category } from '@/app/types/category'

// aglamazo#373: rows are the configured household SUBJECTS themselves
// (מזון, בית, חשמל, ...) — exactly what Settings > נושאים > 🏠 משק בית
// lists (resolveHouseholdExpenseCategories: any expense subject with no
// businessId), not a vendor/merchant pivot. Corrected after Agla's live
// feedback: the business Expense tab's pivot groups by VENDOR because a
// business's own bookkeeping is vendor-shaped; household budgeting is
// subject-shaped (Agla, 2026-09-13: "should only take the subjects that
// are included in the household subjects").

type SubjectRow = {
  category: Category
  byMonth: number[]
  total: number
}

type DrillItem = {
  key: string
  date: string
  description: string
  amount: number
  month: string
  txId?: number
}

function getMonthYear(month: string): { monthNum: number; year: number } {
  const [m, y] = month.split('/')
  return { monthNum: Number(m), year: Number(y) }
}

export default function HouseholdExpensePivot() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [rows, setRows] = useState<SubjectRow[]>([])
  const [monthTotals, setMonthTotals] = useState<number[]>(Array(12).fill(0))
  const [loading, setLoading] = useState(true)
  const [cellItems, setCellItems] = useState<Map<string, DrillItem[]>>(new Map())
  const [drillDown, setDrillDown] = useState<{ subjectName: string; monthIdx: number } | null>(null)

  const cellKey = (subjectName: string, monthIdx: number) => `${subjectName}|${monthIdx}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const allCategories = await subjectStore.getAll()
      // Same top-level-only convention as Settings > נושאים (CategoriesTab.tsx's
      // `inScope`/parentId filter) — a sub-category's own transactions still
      // count, rolled into its parent's row below, rather than getting a
      // separate row absent from the configured subject list.
      const householdCategories = resolveHouseholdExpenseCategories(allCategories)
      const topLevel = householdCategories.filter((c) => !c.parentId)
      const categoriesById = new Map(allCategories.filter((c) => c.id).map((c) => [c.id, c]))
      const byName = new Map(householdCategories.map((c) => [c.name, c]))
      const topLevelNames = new Set(topLevel.map((c) => c.name))

      const allTransactions = await db.transactions.toArray()
      const expenseTransactions = allTransactions
        .filter((t) => t.category && byName.has(t.category) && t.amount < 0)
        .filter((t) => !t.currentStep || t.currentStep === 1)

      const txSyncIds = expenseTransactions.map((t) => t.syncId).filter((id): id is string => id != null)
      const linkedDocs = await db.expenseDocuments.where('transactionId').anyOf(txSyncIds).toArray()
      const firstDocByTxId = new Map<string, ExpenseDocument>()
      for (const doc of linkedDocs) {
        if (doc.transactionId && !firstDocByTxId.has(doc.transactionId)) {
          firstDocByTxId.set(doc.transactionId, doc)
        }
      }

      const years = new Set<number>()
      for (const t of expenseTransactions) years.add(getMonthYear(t.month).year)
      years.add(currentYear)

      const byNameMonth = new Map<string, Map<number, number>>()
      const itemsByName = new Map<string, Map<number, DrillItem[]>>()

      for (const t of expenseTransactions) {
        const { monthNum, year: y } = getMonthYear(t.month)
        if (y !== year || !t.category) continue
        const rowName = resolveTopLevelCategoryName(t.category, byName, categoriesById)
        if (!topLevelNames.has(rowName)) continue // a sub-category whose parent isn't itself a household subject — shouldn't happen, but don't silently misattribute
        const fullAmount = t.totalSteps && t.totalSteps > 1
          ? (t.totalAmount || t.totalSteps * Math.abs(t.amount))
          : Math.abs(t.amount)
        const matchedDoc = t.syncId != null ? firstDocByTxId.get(t.syncId) : undefined
        const amount = householdExpenseNetAmount({ ...t, amount: -fullAmount }, matchedDoc?.vatAmount)
        if (amount <= 0) continue

        if (!byNameMonth.has(rowName)) byNameMonth.set(rowName, new Map())
        const m = byNameMonth.get(rowName)!
        m.set(monthNum - 1, (m.get(monthNum - 1) || 0) + amount)

        if (!itemsByName.has(rowName)) itemsByName.set(rowName, new Map())
        const monthItems = itemsByName.get(rowName)!
        const existing = monthItems.get(monthNum - 1) || []
        existing.push({
          key: `tx-${t.id}`,
          date: t.date,
          description: t.merchant || t.description || rowName,
          amount,
          month: t.month,
          txId: t.id,
        })
        monthItems.set(monthNum - 1, existing)
      }

      const built: SubjectRow[] = topLevel.map((category) => {
        const monthMap = byNameMonth.get(category.name)
        const byMonth = Array.from({ length: 12 }, (_, i) => monthMap?.get(i) || 0)
        return { category, byMonth, total: byMonth.reduce((s, v) => s + v, 0) }
      }).sort((a, b) => a.category.name.localeCompare(b.category.name, 'he'))

      const totals = Array.from({ length: 12 }, (_, i) => built.reduce((s, r) => s + r.byMonth[i], 0))

      const items = new Map<string, DrillItem[]>()
      for (const [name, monthMap] of itemsByName) {
        for (const [monthIdx, list] of monthMap) {
          list.sort((a, b) => a.date.localeCompare(b.date))
          items.set(cellKey(name, monthIdx), list)
        }
      }

      if (cancelled) return
      setAvailableYears(Array.from(years).sort((a, b) => b - a))
      setRows(built)
      setMonthTotals(totals)
      setCellItems(items)
      setDrillDown(null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [year, currentYear])

  const grandTotal = useMemo(() => monthTotals.reduce((s, v) => s + v, 0), [monthTotals])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <label style={{ fontWeight: 600 }}>שנה:</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '1rem', direction: 'rtl' }}
        >
          {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>הסכומים בטבלה נטו, ללא מע״מ</span>
      </div>

      {loading ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem' }}>טוען...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
          אין נושאי הוצאה למשק בית. ניתן להוסיף בהגדרות ← נושאים ← 🏠 משק בית.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', position: 'sticky', right: 0, background: '#fff' }}>נושא</th>
                {MONTH_NAMES_HE.map((m) => (
                  <th key={m} style={{ padding: '0.6rem 0.4rem', textAlign: 'center', whiteSpace: 'nowrap' }}>{m}</th>
                ))}
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 700 }}>סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.5rem', position: 'sticky', right: 0, background: '#fff', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: '0.6rem', height: '0.6rem', borderRadius: '50%', background: row.category.color, display: 'inline-block' }} />
                      <bdi>{row.category.name}</bdi>
                    </span>
                  </td>
                  {row.byMonth.map((amount, i) => {
                    const isActive = drillDown?.subjectName === row.category.name && drillDown?.monthIdx === i
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
                            onClick={() => setDrillDown((prev) =>
                              prev?.subjectName === row.category.name && prev?.monthIdx === i ? null : { subjectName: row.category.name, monthIdx: i }
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
        const items = cellItems.get(cellKey(drillDown.subjectName, drillDown.monthIdx)) || []
        const total = items.reduce((s, it) => s + it.amount, 0)
        return (
          <div style={{ border: '1px solid #bfdbfe', background: '#f8fafc', borderRadius: '0.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                {drillDown.subjectName} — {MONTH_NAMES_HE[drillDown.monthIdx]} {year}
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
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>סכום</th>
                  <th style={{ padding: '0.4rem 0.5rem' }} />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.4rem 0.5rem', whiteSpace: 'nowrap' }}>{it.date}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}><bdi>{it.description}</bdi></td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', fontWeight: 500 }}>
                      {it.amount.toLocaleString()}
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
                  <td colSpan={2} style={{ padding: '0.5rem' }}>סה״כ</td>
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
