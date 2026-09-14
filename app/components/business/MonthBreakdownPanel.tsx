'use client'

import React from 'react'
import type { Transaction } from '@/app/db/financeDB'
import type { ExpenseLine } from './expenseScale'

type Props = {
  onClose: () => void
  monthLabel: string
  incomeTx: Transaction[]
  expenseLines: ExpenseLine[]
}

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }
const tdStyle: React.CSSProperties = { padding: '0.4rem 0.5rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }
const thStyle: React.CSSProperties = { padding: '0.3rem 0.5rem', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }

const label = (t: Transaction) => t.merchant || t.description || '—'

/**
 * Drill-down for "הכנסה נטו" — Agla, live: "I need a way to drill into a
 * number... I want to see the breakdown," then, once shipped as a modal:
 * "Modal is not big enough. Please place a dynamic section under the
 * income tax section." An inline panel rendered under the table instead —
 * full section width, swaps content as a different month is clicked.
 *
 * aglamazo#394: every expense line carries its own recognized fraction —
 * 100% for a category directly assigned to the business, less for a
 * household-folded one (ארנונה/חשמל) — so אחוז/חלק מוכר show exactly what
 * portion of the bank amount actually counted toward this month's
 * netIncome above, instead of leaving that scaling invisible.
 */
export default function MonthBreakdownPanel({ onClose, monthLabel, incomeTx, expenseLines }: Props) {
  const incomeTotal = incomeTx.reduce((s, t) => s + (t.amount || 0), 0)
  const expenseTotal = expenseLines.reduce((s, l) => s + l.recognizedAmount, 0)

  return (
    <div style={{ marginTop: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', background: '#fafafa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>פירוט {monthLabel}</h3>
        <button
          onClick={onClose}
          title="סגור"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1rem', padding: '0.25rem' }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.9rem', color: '#166534', marginBottom: '0.35rem' }}>
          <span>הכנסות</span>
          <span>{fmt(incomeTotal)}</span>
        </div>
        {incomeTx.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>אין הכנסות בחודש זה.</p>
        ) : (
          incomeTx.map((t) => (
            <div key={t.id} style={rowStyle}>
              <span>{label(t)}</span>
              <span>{fmt(t.amount || 0)}</span>
            </div>
          ))
        )}
      </div>

      <div style={{ padding: '0 1rem 1rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.9rem', color: '#dc2626', marginBottom: '0.35rem' }}>
          <span>הוצאות</span>
          <span>{fmt(expenseTotal)}</span>
        </div>
        {expenseLines.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>אין הוצאות בחודש זה.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'right' }}>ספק / תיאור</th>
                  <th style={thStyle}>סכום</th>
                  <th style={thStyle}>אחוז</th>
                  <th style={thStyle}>חלק מוכר</th>
                </tr>
              </thead>
              <tbody>
                {expenseLines.map(({ tx: t, fraction, recognizedAmount }) => (
                  <tr key={t.id}>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{label(t)}</td>
                    <td style={tdStyle}>{fmt(Math.abs(t.amount || 0))}</td>
                    <td style={{ ...tdStyle, color: fraction < 1 ? '#b45309' : '#64748b' }}>{fraction === 1 ? '—' : `${Math.round(fraction * 100)}%`}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{fmt(recognizedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.95rem', padding: '0.75rem 1rem', borderTop: '2px solid #e2e8f0' }}>
        <span>הכנסה נטו</span>
        <span>{fmt(incomeTotal - expenseTotal)}</span>
      </div>
    </div>
  )
}
