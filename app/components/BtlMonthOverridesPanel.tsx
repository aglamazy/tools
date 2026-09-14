'use client'

import React, { useState } from 'react'
import type { BtlMonthOverride } from './TaxProfileSection'

type Props = {
  overrides: BtlMonthOverride[]
  onChange: (next: BtlMonthOverride[]) => void
}

/**
 * aglamazo#390 (Agla via Sheli): some BTL months aren't derivable from any
 * notice or ledger entry — his real June 2026 case: the April notice lists
 * it at ₪6,013, the July notice never mentions it, and the 20/07 lump-sum
 * reduction names no specific month. The only evidence is indirect (the
 * balance BTL asked him to pay came to 2×₪1,091). Explicitly his own
 * judgment call, never inferred by the app — a manual override, shown as
 * an override, with his own note kept alongside it.
 *
 * Kept as its own component — TaxProfileSection.tsx is already close to
 * the 850-line eslint cap.
 */
export default function BtlMonthOverridesPanel({ overrides, onChange }: Props) {
  const [adding, setAdding] = useState(false)
  const [month, setMonth] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const startAdd = () => {
    setMonth('')
    setAmount('')
    setNote('')
    setError('')
    setAdding(true)
  }

  const save = () => {
    const trimmedMonth = month.trim()
    const amountNum = Number(amount)
    if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(trimmedMonth)) { setError('חודש לא תקין — פורמט MM/YYYY'); return }
    if (!amount || !Number.isFinite(amountNum) || amountNum < 0) { setError('סכום לא תקין'); return }
    const rest = overrides.filter((o) => o.month !== trimmedMonth)
    onChange([...rest, { month: trimmedMonth, amount: amountNum, note: note.trim() || undefined }])
    setAdding(false)
  }

  const remove = (targetMonth: string) => {
    onChange(overrides.filter((o) => o.month !== targetMonth))
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>חריגות ידניות לחודש בל&quot;ל (✏️)</span>
        <button
          type="button"
          onClick={startAdd}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.25rem', padding: '0.1rem 0.4rem', cursor: 'pointer', fontSize: '0.7rem', color: '#64748b' }}
        >
          + חריגה
        </button>
      </div>

      {overrides.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
          {overrides.map((o) => (
            <span
              key={o.month}
              title={o.note}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.5rem', fontSize: '0.75rem',
                background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '0.375rem',
              }}
            >
              ✏️ {o.month}: {o.amount.toLocaleString('he-IL')} ₪
              <button
                type="button"
                onClick={() => remove(o.month)}
                title="מחק חריגה"
                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="MM/YYYY"
            style={{ width: '5.5rem', padding: '0.3rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.8rem', direction: 'ltr' }}
          />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₪ סכום"
            min={0}
            style={{ width: '6rem', padding: '0.3rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.8rem', direction: 'ltr' }}
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה (למה? הראייה?)"
            style={{ flex: 1, minWidth: '10rem', padding: '0.3rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}
          />
          <button type="button" onClick={save} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '0.375rem', cursor: 'pointer' }}>
            שמור
          </button>
          <button type="button" onClick={() => setAdding(false)} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: 'none', border: '1px solid #e2e8f0', borderRadius: '0.375rem', cursor: 'pointer', color: '#64748b' }}>
            ביטול
          </button>
          {error && <span style={{ fontSize: '0.75rem', color: '#dc2626', width: '100%' }}>{error}</span>}
        </div>
      )}
    </div>
  )
}
