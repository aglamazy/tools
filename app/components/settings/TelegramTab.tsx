'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { getIdToken } from '@/app/services/firebaseAuthService'

interface TelegramLink {
  chatId: number
  chatType: string
  displayName: string
  linkedAt: string
}

export default function TelegramTab() {
  const [links, setLinks] = useState<TelegramLink[]>([])
  const [linkCode, setLinkCode] = useState('')
  const [expiresIn, setExpiresIn] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const loadLinks = useCallback(async () => {
    try {
      const token = await getIdToken()
      if (!token) return
      const res = await fetch('/api/telegram/link-code', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) setLinks(data.links || [])
    } catch (err: any) {
      console.error('[TelegramTab] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLinks() }, [loadLinks])

  // Countdown timer for code expiry
  useEffect(() => {
    if (expiresIn <= 0) return
    const timer = setInterval(() => {
      setExpiresIn(prev => {
        if (prev <= 1) { setLinkCode(''); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresIn])

  const generateCode = async () => {
    setGenerating(true)
    setError('')
    try {
      const token = await getIdToken()
      if (!token) { setError('לא מחובר'); return }
      const res = await fetch('/api/telegram/link-code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setLinkCode(data.code)
        setExpiresIn(data.expiresIn)
      } else {
        setError(data.error || 'שגיאה')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  if (loading) return <div style={{ color: '#64748b' }}>טוען...</div>

  return (
    <div style={{ maxWidth: '500px' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>טלגרם</h3>
      <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>
        חבר את חשבון הטלגרם שלך כדי לנהל קניות ומשימות דרך{' '}
        <a href="https://t.me/AglamazoBot" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
          @AglamazoBot
        </a>
      </p>

      {error && (
        <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</div>
      )}

      {/* Linked accounts */}
      {links.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>חשבונות מחוברים:</div>
          {links.map((link, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '0.375rem',
              marginBottom: '0.25rem',
              fontSize: '0.85rem',
            }}>
              <span style={{ color: '#16a34a' }}>●</span>
              <span>{link.displayName || 'טלגרם'}</span>
              <span style={{ color: '#64748b' }}>
                ({link.chatType === 'private' ? 'פרטי' : 'קבוצה'})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Generate link code */}
      {linkCode ? (
        <div style={{
          padding: '1rem',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '0.5rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>
            שלח את הפקודה הזו ל-@AglamazoBot בטלגרם:
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            letterSpacing: '0.2em',
            color: '#1e40af',
            direction: 'ltr',
            margin: '0.5rem 0',
          }}>
            /link {linkCode}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            הקוד תקף עוד {formatTime(expiresIn)}
          </div>
        </div>
      ) : (
        <button
          onClick={generateCode}
          disabled={generating}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
            background: generating ? '#94a3b8' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {links.length > 0 ? 'חבר חשבון נוסף' : 'חבר טלגרם'}
        </button>
      )}
    </div>
  )
}
