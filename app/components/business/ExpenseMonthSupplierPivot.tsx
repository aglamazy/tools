'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Transaction, type ExpenseDocument } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import { MONTH_NAMES_HE } from '@/app/lib/dateUtils'
import type { Category } from '@/app/types/category'
import { pickExpenseLabel } from '@/app/utils/expenseLabel'
import { normalizeDate } from '@/app/utils/parsers/shared'

type Props = {
  businessId: number
}

type SupplierRow = {
  supplier: string
  byMonth: number[] // index 0 = January
  total: number
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

export default function ExpenseMonthSupplierPivot({ businessId }: Props) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [rows, setRows] = useState<SupplierRow[]>([])
  const [monthTotals, setMonthTotals] = useState<number[]>(Array(12).fill(0))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const categories = (await subjectStore.getAll()).filter(
        (c: Category) => c.type === 'expense' && c.businessId === businessId && !c.excludeFromBusinessTotals
      )
      const categoryNames = categories.map(c => c.name)

      const allTransactions = await db.transactions.toArray()
      const expenseTransactions = allTransactions
        .filter(t => t.category && categoryNames.includes(t.category) && t.amount < 0)
        .filter(t => !t.currentStep || t.currentStep === 1)

      const allPartnerDocs = await db.expenseDocuments
        .filter(d => d.businessId === businessId && !d.transactionId && !!d.paidByUid)
        .toArray()

      const txIds = expenseTransactions.map(t => t.id).filter((id): id is number => id != null)
      const linkedDocs = await db.expenseDocuments.where('transactionId').anyOf(txIds).toArray()
      const firstDocByTxId = new Map<number, ExpenseDocument>()
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
      const addAmount = (supplier: string, monthIdx: number, y: number, amount: number) => {
        if (y !== year) return
        if (!byYearMonth.has(supplier)) byYearMonth.set(supplier, new Map())
        const m = byYearMonth.get(supplier)!
        m.set(monthIdx, (m.get(monthIdx) || 0) + amount)
      }

      for (const t of expenseTransactions) {
        const fullAmount = t.totalSteps && t.totalSteps > 1
          ? (t.totalAmount || t.totalSteps * Math.abs(t.amount))
          : Math.abs(t.amount)
        const monthNum = Number(t.month.split('/')[0])
        const y = Number(t.month.split('/')[1])
        const supplier = supplierLabelForTransaction(t, t.id != null ? firstDocByTxId.get(t.id) : undefined)
        addAmount(supplier, monthNum - 1, y, fullAmount)
      }

      for (const d of allPartnerDocs) {
        const parts = getCanonicalDateParts(d.date)
        if (!parts) continue
        const { year: y, month: monthNum } = parts
        const supplier = supplierLabelForDoc(d)
        addAmount(supplier, monthNum - 1, y, Math.abs(d.amount || 0))
      }

      const built: SupplierRow[] = Array.from(byYearMonth.entries()).map(([supplier, monthMap]) => {
        const byMonth = Array.from({ length: 12 }, (_, i) => monthMap.get(i) || 0)
        return { supplier, byMonth, total: byMonth.reduce((s, v) => s + v, 0) }
      }).sort((a, b) => b.total - a.total)

      const totals = Array.from({ length: 12 }, (_, i) => built.reduce((s, r) => s + r.byMonth[i], 0))

      if (cancelled) return
      setAvailableYears(Array.from(years).sort((a, b) => b - a))
      setRows(built)
      setMonthTotals(totals)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [businessId, year, currentYear])

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
                    const monthStr = `${String(i + 1).padStart(2, '0')}/${year}`
                    return (
                    <td
                      key={i}
                      style={{
                        padding: '0.5rem 0.4rem',
                        textAlign: 'center',
                        color: amount ? '#0f172a' : '#cbd5e1',
                        background: amount ? '#eff6ff' : 'transparent',
                      }}
                    >
                      {amount ? (
                        <a
                          href={`/app/budget?month=${encodeURIComponent(monthStr)}`}
                          title="פתח בעמוד התקציב לחודש זה"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {amount.toLocaleString()}
                        </a>
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
    </div>
  )
}
