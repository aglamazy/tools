'use client'

import React from 'react'
import type { TaxStatus, TaxStatusInfo } from '@/app/components/TaxExemptBadge'

const TAX_STATUS_STYLES: Record<TaxStatus, { bg: string; border: string; text: string; label: string }> = {
  green: { bg: '#f0fdf4', border: '#86efac', text: '#16a34a', label: 'תקין — הכנסה מהשכרה בטווח הפטור' },
  yellow: { bg: '#fefce8', border: '#fde047', text: '#a16207', label: 'זהירות — מתקרב לתקרת השכרת דירה' },
  red: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626', label: 'חריגה — הכנסה מהשכרה עברה את התקרה' },
  gray: { bg: '#f9fafb', border: '#d1d5db', text: '#9ca3af', label: 'טרם הוגדר' },
}

const EXEMPT_STATUS_LABELS: Record<TaxStatus, string> = {
  green: 'תקין — הכנסה בטווח תקרת עוסק פטור',
  yellow: 'זהירות — מתקרב לתקרת עוסק פטור',
  red: 'חריגה — הכנסה עברה את תקרת עוסק פטור',
  gray: 'טרם הוגדר',
}

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

export function TaxExemptStatusBanner({ info }: { info: TaxStatusInfo }) {
  const style = TAX_STATUS_STYLES[info.status]
  const remainingToLimit = Math.max(0, info.limit - info.maxMonthlyIncome)
  const pct = info.limit > 0 ? Math.min(100, (info.maxMonthlyIncome / info.limit) * 100) : 0

  return (
    <div style={{
      marginBottom: '1rem',
      padding: '0.75rem 1rem',
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: '0.5rem',
      fontSize: '0.9rem',
      color: style.text,
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{style.label}</div>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem', color: '#475569' }}>
        <div><span style={{ color: '#64748b' }}>הכנסה חודשית מקסימלית: </span><strong>{fmt(info.maxMonthlyIncome)}</strong></div>
        <div><span style={{ color: '#64748b' }}>תקרה חודשית: </span><strong>{fmt(info.limit)}</strong></div>
        <div><span style={{ color: '#64748b' }}>נותר עד לתקרה: </span><strong>{fmt(remainingToLimit)}</strong></div>
      </div>
      <div style={{ marginTop: '0.5rem', height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: style.text,
          borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}

export function ExemptStatusBanner({ info }: { info: TaxStatusInfo }) {
  const style = TAX_STATUS_STYLES[info.status]
  const remainingToLimit = Math.max(0, info.limit - info.currentIncome)
  const pct = info.limit > 0 ? Math.round((info.currentIncome / info.limit) * 100) : 0

  return (
    <div style={{
      marginBottom: '1rem',
      padding: '0.75rem 1rem',
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: '0.5rem',
      fontSize: '0.9rem',
      color: style.text,
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{EXEMPT_STATUS_LABELS[info.status]}</div>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem', color: '#475569' }}>
        <div><span style={{ color: '#64748b' }}>הכנסה שנתית: </span><strong>{fmt(info.currentIncome)}</strong></div>
        <div><span style={{ color: '#64748b' }}>תקרה שנתית: </span><strong>{fmt(info.limit)}</strong></div>
        <div><span style={{ color: '#64748b' }}>נותר: </span><strong>{fmt(remainingToLimit)}</strong></div>
        <div><span style={{ color: '#64748b' }}>ניצול: </span><strong>{pct}%</strong></div>
      </div>
      <div style={{ marginTop: '0.5rem', height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, pct)}%`,
          background: style.text,
          borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}
