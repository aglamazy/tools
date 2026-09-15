'use client'

import { useState } from 'react'

type IncomeRowLike = { amount: number; outputVat: number; vatRate: number }
type ExpenseRowLike = { amount: number; inputVat: number; vatRate: number; category: string }

type ShaamFilingViewProps = {
  periodLabel: string
  dealerNumber?: string
  incomeRows: IncomeRowLike[]
  expenseRows: ExpenseRowLike[]
  equipmentCategory?: string // category name treated as תשומות ציוד — defaults to 'ציוד'
}

type RateRow = { ratePct: number; net: number; vat: number }

function groupByRate(rows: IncomeRowLike[]): RateRow[] {
  const byRate = new Map<number, RateRow>()
  for (const r of rows) {
    const ratePct = Math.round(r.vatRate * 100)
    const existing = byRate.get(ratePct) || { ratePct, net: 0, vat: 0 }
    existing.net += r.amount
    existing.vat += r.outputVat
    byRate.set(ratePct, existing)
  }
  return [...byRate.values()].sort((a, b) => b.ratePct - a.ratePct)
}

// aglamazo#405, Sheli — confirmed from Agla's actual filed return PDF: the
// תשומות ציוד/אחרות columns hold the VAT AMOUNT, not the net amount (₪167
// in, ₪167 out on his real filing) — opposite of the עסקאות side, which IS
// net. Split itself is by Aglamazo's `equipmentCategory`, the only signal
// today — his own filing put electricity/phone/internet/ypay fees under
// ציוד, which Sheli flagged as a real mislabel at the point of entry, hence
// the plain-language column subtext below rather than bare form terms.
type InputRateRow = { ratePct: number; equipmentVat: number; otherVat: number; vat: number }

function groupInputsByRate(rows: ExpenseRowLike[], equipmentCategory: string): InputRateRow[] {
  const byRate = new Map<number, InputRateRow>()
  for (const r of rows) {
    const ratePct = Math.round(r.vatRate * 100)
    const existing = byRate.get(ratePct) || { ratePct, equipmentVat: 0, otherVat: 0, vat: 0 }
    if (r.category === equipmentCategory) existing.equipmentVat += r.inputVat
    else existing.otherVat += r.inputVat
    existing.vat += r.inputVat
    byRate.set(ratePct, existing)
  }
  return [...byRate.values()].sort((a, b) => b.ratePct - a.ratePct)
}

const fmt = (n: number) => Math.round(n).toLocaleString('he-IL')

function CopyField({ value, label }: { value: number; label: string }) {
  const [copied, setCopied] = useState(false)
  const text = Math.round(value).toString()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the number is
      // still visible on screen, so this is a soft failure, not a blocker.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={`העתק ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.5rem',
        background: copied ? '#dcfce7' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.375rem',
        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, direction: 'ltr', color: '#1e293b',
      }}
    >
      {text} {copied ? '✓' : '⧉'}
    </button>
  )
}

const th: React.CSSProperties = { padding: '0.4rem 0.6rem', textAlign: 'right', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }
const td: React.CSSProperties = { padding: '0.4rem 0.6rem', fontSize: '0.85rem' }

/**
 * The field layout of שע"מ's own מע"מ filing form (aglamazo#405, Agla's own
 * request: "I need the data like this. Please file Aglamazo to show the
 * data in this manner.") — a rate-split view of what's already computed
 * correctly elsewhere on this page, ordered and granular the way he
 * actually types it in, with a copy button per field. Per Sheli's note
 * against his real filed return: the form only shows rate rows actually in
 * play (no 17% here, VAT was 17% pre-2025) — never render a zero row.
 */
export default function ShaamFilingView({ periodLabel, dealerNumber, incomeRows, expenseRows, equipmentCategory = 'ציוד' }: ShaamFilingViewProps) {
  const outputRows = groupByRate(incomeRows).filter((r) => r.net !== 0 || r.vat !== 0)
  const inputRows = groupInputsByRate(expenseRows, equipmentCategory).filter((r) => r.vat !== 0)
  const outputTotalVat = outputRows.reduce((s, r) => s + r.vat, 0)
  const inputTotalVat = inputRows.reduce((s, r) => s + r.vat, 0)
  const net = outputTotalVat - inputTotalVat

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#475569' }}>
        <span>מספר עוסק: <strong>{dealerNumber || '—'}</strong></span>
        <span>תקופת דיווח: <strong>{periodLabel}</strong></span>
      </div>

      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem' }}>עסקאות</div>
      <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={th}>שיעור מס</th>
              <th style={th}>עסקאות (ללא מע״מ)</th>
              <th style={th}>מס עסקאות</th>
            </tr>
          </thead>
          <tbody>
            {outputRows.map((row) => (
              <tr key={row.ratePct} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={td}>עסקאות חייבות {row.ratePct.toFixed(2)}%</td>
                <td style={td}><CopyField value={row.net} label={`עסקאות ${row.ratePct}%`} /></td>
                <td style={td}><CopyField value={row.vat} label={`מס עסקאות ${row.ratePct}%`} /></td>
              </tr>
            ))}
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={td}>עסקאות פטורות או בשיעור אפס</td>
              <td style={td}><CopyField value={0} label="עסקאות פטורות" /></td>
              <td style={{ ...td, color: '#94a3b8' }}>—</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>סה״כ מס עסקאות</td>
              <td style={td} />
              <td style={td}><CopyField value={outputTotalVat} label="סה״כ מס עסקאות" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem' }}>תשומות</div>
      <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={th}>שיעור מס</th>
              <th style={th}>ציוד ורכוש קבוע</th>
              <th style={th}>חשמל, טלפון, אינטרנט, עמלות וכו׳</th>
              <th style={th}>מס תשומות</th>
            </tr>
          </thead>
          <tbody>
            {inputRows.map((row) => (
              <tr key={row.ratePct} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={td}>תשומות {row.ratePct.toFixed(2)}%</td>
                <td style={td}><CopyField value={row.equipmentVat} label={`תשומות ציוד ${row.ratePct}%`} /></td>
                <td style={td}><CopyField value={row.otherVat} label={`תשומות אחרות ${row.ratePct}%`} /></td>
                <td style={td}><CopyField value={row.vat} label={`מס תשומות ${row.ratePct}%`} /></td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>סה״כ מס תשומות</td>
              <td style={td} /><td style={td} />
              <td style={td}><CopyField value={inputTotalVat} label="סה״כ מס תשומות" /></td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.3rem' }}>
          העמודות הן סכום המע״מ עצמו (לא הסכום ללא מע״מ) — כפי שמופיע בטופס דיווח שהוגש בפועל.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
        <span>{net >= 0 ? 'סכום לתשלום' : 'סכום להחזר'}:</span>
        <span style={{ fontSize: '1.1rem' }}>₪{fmt(Math.abs(net))}</span>
      </div>
    </div>
  )
}
