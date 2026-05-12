import type React from 'react'

export const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

export const cellStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  textAlign: 'left' as const,
  direction: 'ltr',
}

export const tHeaderStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  background: '#f8fafc',
  color: '#475569',
  borderBottom: '2px solid #e2e8f0',
}

export const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })
