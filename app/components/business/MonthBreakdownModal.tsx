'use client'

import React from 'react'
import type { Transaction } from '@/app/db/financeDB'
import Modal from '@/app/components/Modal'

type Props = {
  isOpen: boolean
  onClose: () => void
  monthLabel: string
  incomeTx: Transaction[]
  expenseTx: Transaction[]
}

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }

/**
 * Drill-down for "הכנסה נטו" — Agla, live, pointing at a real -₪3,237
 * month: "I need a way to drill into a number... I want to see the
 * breakdown." Lists the actual income and expense transactions that sum to
 * the month's net figure, instead of leaving the number opaque.
 */
export default function MonthBreakdownModal({ isOpen, onClose, monthLabel, incomeTx, expenseTx }: Props) {
  const incomeTotal = incomeTx.reduce((s, t) => s + (t.amount || 0), 0)
  const expenseTotal = expenseTx.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const label = (t: Transaction) => t.merchant || t.description || '—'

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="480px">
      <div style={{ padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>פירוט {monthLabel}</h3>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.85rem', color: '#166534', marginBottom: '0.25rem' }}>
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

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.85rem', color: '#dc2626', marginBottom: '0.25rem' }}>
            <span>הוצאות</span>
            <span>{fmt(expenseTotal)}</span>
          </div>
          {expenseTx.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>אין הוצאות בחודש זה.</p>
          ) : (
            expenseTx.map((t) => (
              <div key={t.id} style={rowStyle}>
                <span>{label(t)}</span>
                <span>{fmt(Math.abs(t.amount || 0))}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.9rem', marginTop: '1rem', paddingTop: '0.5rem', borderTop: '2px solid #e2e8f0' }}>
          <span>הכנסה נטו</span>
          <span>{fmt(incomeTotal - expenseTotal)}</span>
        </div>
      </div>
    </Modal>
  )
}
