'use client'

import React, { useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'
import { GOOGLE_EVENT_COLORS } from '@/app/services/billing/eventColors'

type BillingEventColorPickerProps = {
  business: Business
  onSaved: () => void | Promise<void>
}

type Status = { type: 'idle' | 'success' | 'error'; message: string }

/**
 * Optional color filter for the monthly lesson scan (aglamazo#439): only events
 * of the chosen Google event color count as lessons. Persists on
 * Business.billingEventColorId; '' (the default option) = every event.
 */
export default function BillingEventColorPicker({ business, onSaved }: BillingEventColorPickerProps) {
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' })
  const savedId = business.billingEventColorId || ''
  const saved = GOOGLE_EVENT_COLORS.find(c => c.id === savedId)

  const handleSelect = async (colorId: string) => {
    if (!business.id) return
    // Always a string ('' = every event) — never undefined, which a Dexie update would treat as a key delete.
    const ok = await businessStore.update(business.id, { billingEventColorId: colorId })
    if (!ok) {
      setStatus({ type: 'error', message: 'שגיאה בשמירה' })
      return
    }
    setStatus({ type: 'success', message: 'נשמר' })
    await onSaved()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
      <label htmlFor="billing-event-color" style={{ minWidth: '140px', fontWeight: 500, fontSize: '0.9rem' }}>
        צבע שיעורים לחיוב:
      </label>
      <select
        id="billing-event-color"
        value={savedId}
        onChange={(e) => void handleSelect(e.target.value)}
        style={{ minWidth: '220px', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
      >
        <option value="">כל האירועים (ללא סינון)</option>
        {GOOGLE_EVENT_COLORS.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {saved && (
        <span
          aria-hidden
          style={{ width: '1rem', height: '1rem', borderRadius: '50%', background: saved.hex, display: 'inline-block' }}
        />
      )}
      {saved && (
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
          רק אירועים שנצבעו בצבע זה נספרים כשיעורים
        </span>
      )}
      {status.message && (
        <span style={{ fontSize: '0.85rem', color: status.type === 'success' ? '#16a34a' : '#dc2626' }}>
          {status.message}
        </span>
      )}
    </div>
  )
}
