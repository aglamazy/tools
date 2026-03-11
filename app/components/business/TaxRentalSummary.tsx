'use client'

import React, { useState } from 'react'
import type { Business, Transaction } from '@/app/db/financeDB'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const cellStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  textAlign: 'left' as const,
  direction: 'ltr',
}

const tHeaderStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  background: '#f8fafc',
  color: '#475569',
  borderBottom: '2px solid #e2e8f0',
}

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

export default function RentalSummaryTable({ businesses, transactions, bizCategoryMap, currentYear, currentMonth }: {
  businesses: Business[]
  transactions: Transaction[]
  bizCategoryMap: Map<number, string[]>
  currentYear: number
  currentMonth: number
}) {
  const monthlyData = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    let total = 0
    const perBiz: Record<number, number> = {}
    for (const biz of businesses) {
      const catNames = bizCategoryMap.get(biz.id!) || []
      const income = transactions
        .filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
        .reduce((s, t) => s + (t.amount || 0), 0)
      perBiz[biz.id!] = income
      total += income
    }
    return { month: i, label: HEBREW_MONTHS[i], perBiz, total }
  })

  const totals = {
    total: monthlyData.reduce((s, m) => s + m.total, 0),
    perBiz: Object.fromEntries(businesses.map(biz => [
      biz.id!, monthlyData.reduce((s, m) => s + (m.perBiz[biz.id!] || 0), 0),
    ])),
  }

  const showPerBiz = businesses.length > 1

  const [drillDown, setDrillDown] = useState<{ monthIdx: number; bizId: number } | null>(null)

  const getDrillDownTransactions = () => {
    if (!drillDown) return []
    const monthStr = `${String(drillDown.monthIdx + 1).padStart(2, '0')}/${currentYear}`
    const catNames = bizCategoryMap.get(drillDown.bizId) || []
    return transactions
      .filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>השכרת דירה — סיכום שנתי {currentYear}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>חודש</th>
            {showPerBiz && businesses.map(biz => (
              <th key={biz.id} style={{ ...tHeaderStyle, background: '#ecfdf5', color: '#059669' }}>{biz.name}</th>
            ))}
            <th style={{ ...tHeaderStyle, background: '#ecfdf5', color: '#059669' }}>סה&quot;כ</th>
          </tr>
        </thead>
        <tbody>
          {monthlyData.map(row => (
            <tr key={row.month} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 500 }}>{row.label}</td>
              {showPerBiz && businesses.map(biz => {
                const val = row.perBiz[biz.id!] || 0
                return (
                  <td
                    key={biz.id}
                    onClick={() => val ? setDrillDown(
                      drillDown?.monthIdx === row.month && drillDown?.bizId === biz.id! ? null : { monthIdx: row.month, bizId: biz.id! }
                    ) : undefined}
                    style={{
                      ...cellStyle,
                      background: drillDown?.monthIdx === row.month && drillDown?.bizId === biz.id! ? '#d1fae5' : '#f0fdf4',
                      cursor: val ? 'pointer' : 'default',
                    }}
                  >
                    {val ? fmt(val) : '—'}
                  </td>
                )
              })}
              <td
                style={{
                  ...cellStyle,
                  background: !showPerBiz && drillDown?.monthIdx === row.month ? '#d1fae5' : '#f0fdf4',
                  fontWeight: 500,
                  cursor: !showPerBiz && row.total ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (!showPerBiz && row.total && businesses[0]) {
                    setDrillDown(drillDown?.monthIdx === row.month ? null : { monthIdx: row.month, bizId: businesses[0].id! })
                  }
                }}
              >
                {row.total ? fmt(row.total) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0', background: '#ecfdf5' }}>
            <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
            {showPerBiz && businesses.map(biz => (
              <td key={biz.id} style={{ ...cellStyle, fontWeight: 700, color: '#059669' }}>
                {fmt(totals.perBiz[biz.id!] || 0)}
              </td>
            ))}
            <td style={{ ...cellStyle, fontWeight: 700, color: '#059669' }}>{fmt(totals.total)}</td>
          </tr>
        </tfoot>
      </table>

      {drillDown && (() => {
        const biz = businesses.find(b => b.id === drillDown.bizId)
        const txList = getDrillDownTransactions()
        const total = txList.reduce((s, t) => s + (t.amount || 0), 0)
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #bbf7d0', borderRadius: '0.5rem', background: '#f0fdf4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                {biz?.name} — {HEBREW_MONTHS[drillDown.monthIdx]} {currentYear}
              </h4>
              <button onClick={() => setDrillDown(null)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            {txList.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>אין תנועות</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>תאריך</th>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>תיאור</th>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>קטגוריה</th>
                    <th style={tHeaderStyle}>סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {txList.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.date}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.description}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.category}</td>
                      <td style={{ ...cellStyle, color: '#16a34a' }}>{fmt(tx.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={3} style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: '#16a34a' }}>{fmt(total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )
      })()}
    </div>
  )
}
