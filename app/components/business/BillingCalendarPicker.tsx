'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { businessStore } from '@/app/stores/businessStore'
import type { Business } from '@/app/db/financeDB'
import {
  hasCalendarAccess,
  requestCalendarAccess,
  fetchCalendarList,
  type CalendarListEntry,
} from '@/app/services/googleCalendarService'

type BillingCalendarPickerProps = {
  business: Business
  onSaved: () => void | Promise<void>
}

type Status = { type: 'idle' | 'success' | 'error'; message: string }

/**
 * Pick the Google Calendar the monthly lesson-billing scan reads (aglamazo#430).
 * The choice persists on Business.billingCalendarId; '' (the default option)
 * means the account's primary calendar.
 */
export default function BillingCalendarPicker({ business, onSaved }: BillingCalendarPickerProps) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [calendars, setCalendars] = useState<CalendarListEntry[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' })
  const savedId = business.billingCalendarId || ''

  const loadCalendars = useCallback(async () => {
    setLoadingList(true)
    const result = await fetchCalendarList()
    setLoadingList(false)
    if (result.error) {
      console.error('[BillingCalendarPicker] calendar list failed:', result.error)
      setStatus({ type: 'error', message: 'שגיאה בטעינת רשימת היומנים' })
      return
    }
    setCalendars(result.calendars)
  }, [])

  useEffect(() => {
    void hasCalendarAccess().then(ok => {
      setConnected(ok)
      if (ok) void loadCalendars()
    })
  }, [loadCalendars])

  const handleConnect = async () => {
    const result = await requestCalendarAccess()
    if (!result.success) {
      setStatus({ type: 'error', message: result.error || 'שגיאה בחיבור ליומן' })
      return
    }
    setConnected(true)
    await loadCalendars()
  }

  const handleSelect = async (calendarId: string) => {
    if (!business.id) return
    // Always a string ('' = primary) — never undefined, which a Dexie update would treat as a key delete.
    const ok = await businessStore.update(business.id, { billingCalendarId: calendarId })
    if (!ok) {
      setStatus({ type: 'error', message: 'שגיאה בשמירה' })
      return
    }
    setStatus({ type: 'success', message: 'נשמר' })
    await onSaved()
  }

  const savedMissing = savedId !== '' && calendars.length > 0 && !calendars.some(c => c.id === savedId)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
      <label htmlFor="billing-calendar" style={{ minWidth: '140px', fontWeight: 500, fontSize: '0.9rem' }}>
        יומן השיעורים:
      </label>
      {connected === false ? (
        <button onClick={() => void handleConnect()} className="upload-another-btn" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          חיבור ליומן Google
        </button>
      ) : (
        <select
          id="billing-calendar"
          value={savedId}
          disabled={connected === null || loadingList}
          onChange={(e) => void handleSelect(e.target.value)}
          style={{ minWidth: '220px', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
        >
          <option value="">יומן ראשי (ברירת מחדל)</option>
          {calendars.filter(c => !c.primary).map(c => (
            <option key={c.id} value={c.id}>{c.summary}</option>
          ))}
          {calendars.filter(c => c.primary).map(c => (
            <option key={c.id} value={c.id}>{c.summary} (ראשי)</option>
          ))}
          {savedMissing && <option value={savedId}>יומן שמור שאינו ברשימה ({savedId})</option>}
        </select>
      )}
      {loadingList && <span style={{ fontSize: '0.85rem', color: '#64748b' }}>טוען יומנים...</span>}
      {status.message && (
        <span style={{ fontSize: '0.85rem', color: status.type === 'success' ? '#16a34a' : '#dc2626' }}>
          {status.message}
        </span>
      )}
    </div>
  )
}
