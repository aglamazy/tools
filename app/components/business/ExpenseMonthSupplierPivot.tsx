'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Business, type Transaction, type ExpenseDocument } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { MONTH_NAMES_HE } from '@/app/lib/dateUtils'
import { pickExpenseLabel } from '@/app/utils/expenseLabel'
import { normalizeDate } from '@/app/utils/parsers/shared'
import { effectiveExpenseAmount, resolveBusinessExpenseCategories } from './expenseScale'

type Props = {
  businessId: string
  business: Business
}

type SupplierRow = {
  supplier: string
  byMonth: number[] // index 0 = January
  total: number
}

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

function supplierLabelForTransaction(t: Transaction, doc?: ExpenseDocument): string {
  return pickExpenseLabel(doc?.description, doc?.vendor, t.merchant, t.description)
}

function supplierLabelForDoc(d: ExpenseDocument): string {
  return d.vendor || d.fileName
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

  const cellKey = (supplier: string, monthIdx: number) => `${supplier}|${monthIdx}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
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

      const byYearMonth = new Map<string, Map<number, number>>() // supplier -> monthIdx -> sum
      const items = new Map<string, DrillItem[]>() // `${supplier}|${monthIdx}` -> validation rows
      const addAmount = (supplier: string, monthIdx: number, y: number, amount: number, item: DrillItem) => {
        if (y !== year) return
        if (!byYearMonth.has(supplier)) byYearMonth.set(supplier, new Map())
        const m = byYearMonth.get(supplier)!
        m.set(monthIdx, (m.get(monthIdx) || 0) + amount)
        const key = cellKey(supplier, monthIdx)
        const existing = items.get(key) || []
        existing.push(item)
        items.set(key, existing)
      }

      for (const t of expenseTransactions) {
        // Installment purchases use the full purchase amount, same as
        // everywhere else this pivot's month-column figures come from.
        // Then effectiveExpenseAmount scales household-deductible categories
        // (e.g. a shared electricity bill) down to this business owner's
        // percentage — direct business categories pass through at full amount.
        const fullAmount = t.totalSteps && t.totalSteps > 1
          ? (t.totalAmount || t.totalSteps * Math.abs(t.amount))
          : Math.abs(t.amount)
        const amount = effectiveExpenseAmount({ ...t, amount: -fullAmount }, business, categoryByName)
        if (amount <= 0) continue
        const monthNum = Number(t.month.split('/')[0])
        const y = Number(t.month.split('/')[1])
        const supplier = supplierLabelForTransaction(t, t.syncId != null ? firstDocByTxId.get(t.syncId) : undefined)
        addAmount(supplier, monthNum - 1, y, amount, {
          key: `tx-${t.id}`,
          date: t.date,
          description: t.description || t.merchant || supplier,
          rawAmount: fullAmount,
          effectiveAmount: amount,
          month: t.month,
          txId: t.id,
        })
      }

      for (const d of allPartnerDocs) {
        const parts = getCanonicalDateParts(d.date)
        if (!parts) continue
        const { year: y, month: monthNum } = parts
        const supplier = supplierLabelForDoc(d)
        const amount = Math.abs(d.amount || 0)
        addAmount(supplier, monthNum - 1, y, amount, {
          key: `doc-${d.id}`,
          date: d.date || '',
          description: `${d.vendor || d.fileName} (חשבונית ששולמה ע״י שותף)`,
          rawAmount: amount,
          effectiveAmount: amount,
          month: `${String(monthNum).padStart(2, '0')}/${y}`,
        })
      }

      const built: SupplierRow[] = Array.from(byYearMonth.entries()).map(([supplier, monthMap]) => {
        const byMonth = Array.from({ length: 12 }, (_, i) => monthMap.get(i) || 0)
        return { supplier, byMonth, total: byMonth.reduce((s, v) => s + v, 0) }
      }).sort((a, b) => b.total - a.total)

      const totals = Array.from({ length: 12 }, (_, i) => built.reduce((s, r) => s + r.byMonth[i], 0))

      for (const list of items.values()) list.sort((a, b) => a.date.localeCompare(b.date))

      if (cancelled) return
      setAvailableYears(Array.from(years).sort((a, b) => b - a))
      setRows(built)
      setMonthTotals(totals)
      setCellItems(items)
      setDrillDown(null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [businessId, business, year, currentYear])

  const grandTotal = useMemo(() => monthTotals.reduce((s, v) => s + v, 0), [monthTotals])

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
                <tr key={row.supplier} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.5rem', position: 'sticky', right: 0, background: '#fff', whiteSpace: 'nowrap' }}>{row.supplier}</td>
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
