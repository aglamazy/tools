'use client'

import React, { useEffect, useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'
import BillingCalendarPicker from './BillingCalendarPicker'
import BillingEventColorPicker from './BillingEventColorPicker'

type TeacherBillingSettingsProps = {
  business: Business
  onSaved: () => void | Promise<void>
}

type Status = { type: 'idle' | 'success' | 'error'; message: string }

/**
 * Teacher billing settings (calendar-billing epic): the business-level default
 * lesson rate, prefilled into every newly created student (aglamazo#428), and
 * the Google Calendar the monthly lesson scan reads (aglamazo#430), and an
 * optional event color that marks the billable lessons (aglamazo#439).
 */
export default function TeacherBillingSettings({ business, onSaved }: TeacherBillingSettingsProps) {
  const [rate, setRate] = useState('')
  const [rateStatus, setRateStatus] = useState<Status>({ type: 'idle', message: '' })

  useEffect(() => {
    setRate(business.defaultLessonRate ? String(business.defaultLessonRate) : '')
  }, [business.defaultLessonRate])

  const saveRate = async () => {
    if (!business.id) return
    const trimmed = rate.trim()
    // Empty = no default. Stored as 0 rather than undefined: an undefined value in
    // a Dexie update payload deletes the key, and 0 already reads as "no default".
    const value = trimmed === '' ? 0 : Number(trimmed)
    if (!Number.isFinite(value) || value < 0) {
      setRateStatus({ type: 'error', message: 'יש להזין מחיר תקין' })
      return
    }
    const ok = await businessStore.update(business.id, { defaultLessonRate: value })
    if (!ok) {
      setRateStatus({ type: 'error', message: 'שגיאה בשמירה' })
      return
    }
    setRateStatus({ type: 'success', message: 'נשמר' })
    await onSaved()
  }

  return (
    <section style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', background: '#f0fdf4' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>חיוב תלמידים</h3>
      <p style={{ margin: '0 0 1rem', color: '#166534', fontSize: '0.85rem' }}>
        מחיר ברירת המחדל לשיעור ימולא אוטומטית בכל תלמיד חדש, וניתן לשנות אותו לכל תלמיד בנפרד
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label htmlFor="default-lesson-rate" style={{ minWidth: '140px', fontWeight: 500, fontSize: '0.9rem' }}>
          מחיר ברירת מחדל לשיעור (₪):
        </label>
        <input
          id="default-lesson-rate"
          type="number"
          min={0}
          value={rate}
          onChange={(e) => { setRate(e.target.value); setRateStatus({ type: 'idle', message: '' }) }}
          style={{ width: '110px', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
          placeholder="150"
        />
        <button onClick={() => void saveRate()} className="file-picker" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          שמור
        </button>
        {rateStatus.message && (
          <span style={{ fontSize: '0.85rem', color: rateStatus.type === 'success' ? '#16a34a' : '#dc2626' }}>
            {rateStatus.message}
          </span>
        )}
      </div>
      <BillingCalendarPicker business={business} onSaved={onSaved} />
      <BillingEventColorPicker business={business} onSaved={onSaved} />
    </section>
  )
}
