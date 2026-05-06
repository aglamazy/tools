'use client'

import { useEffect, useState } from 'react'
import { getIdToken } from '@/app/services/firebaseAuthService'

interface PanicConfigState {
  adminTelegramChatId: number | ''
  throttleMinutes: number | ''
  lastFiredAt: string | null
}

const EMPTY: PanicConfigState = { adminTelegramChatId: '', throttleMinutes: '', lastFiredAt: null }

export default function SystemSettingsPanel() {
  const [config, setConfig] = useState<PanicConfigState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getIdToken()
        const res = await fetch('/api/admin/panic-config', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json()
        if (cancelled) return
        if (res.ok) {
          setConfig({
            adminTelegramChatId: typeof data.adminTelegramChatId === 'number' ? data.adminTelegramChatId : '',
            throttleMinutes: typeof data.throttleMinutes === 'number' ? data.throttleMinutes : '',
            lastFiredAt: data.lastFiredAt ?? null,
          })
        } else {
          setError(data.error || 'שגיאה בטעינת הגדרות')
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'שגיאת רשת')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const token = await getIdToken()
      const res = await fetch('/api/admin/panic-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          adminTelegramChatId: config.adminTelegramChatId === '' ? undefined : Number(config.adminTelegramChatId),
          throttleMinutes: config.throttleMinutes === '' ? undefined : Number(config.throttleMinutes),
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setSavedAt(Date.now())
        setTimeout(() => setSavedAt(null), 2500)
      } else {
        setError(data.error || 'שגיאה בשמירה')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="banner">טוען...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 520 }}>
      <h3 style={{ margin: 0 }}>התראות מערכת (פאניקה)</h3>
      <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
        כשה-LLM מפסיק להגיב לאחר שלל ניסיונות, נשלחת התראת טלגרם לכתובת הבאה. הגבלת תדירות מונעת הצפה.
      </p>

      {error && (
        <div className="banner error" style={{ color: '#dc2626', background: '#fef2f2', padding: '0.6rem', borderRadius: '0.4rem' }}>
          {error}
        </div>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span>Admin Telegram Chat ID</span>
        <input
          type="number"
          value={config.adminTelegramChatId}
          onChange={e => setConfig(c => ({ ...c, adminTelegramChatId: e.target.value === '' ? '' : Number(e.target.value) }))}
          placeholder="5867887519 (ברירת מחדל)"
          style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span>הגבלת תדירות (דקות בין התראות)</span>
        <input
          type="number"
          min={1}
          max={1440}
          value={config.throttleMinutes}
          onChange={e => setConfig(c => ({ ...c, throttleMinutes: e.target.value === '' ? '' : Number(e.target.value) }))}
          placeholder="10 (ברירת מחדל)"
          style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.4rem' }}
        />
      </label>

      {config.lastFiredAt && (
        <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          התראה אחרונה: {new Date(config.lastFiredAt).toLocaleString('he-IL')}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button onClick={save} disabled={saving} style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'שומר...' : 'שמור'}
        </button>
        {savedAt && <span style={{ color: '#16a34a' }}>✓ נשמר</span>}
      </div>
    </div>
  )
}
