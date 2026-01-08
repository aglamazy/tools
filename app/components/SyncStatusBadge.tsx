'use client'

import { useEffect, useMemo, useState } from 'react'
import { getDriveSyncSettings, type DriveSyncSettings } from '@/app/services/appSettingsService'

type StatusKind = 'ok' | 'stale' | 'error' | 'off' | 'idle'

export default function SyncStatusBadge() {
  const [settings, setSettings] = useState<DriveSyncSettings | null>(null)
  const [status, setStatus] = useState<StatusKind>('idle')
  const [now, setNow] = useState<number>(Date.now())

  const refresh = async () => {
    try {
      const s = await getDriveSyncSettings()
      setSettings(s)

      if (s.lastSyncError) {
        setStatus('error')
        return
      }
      if (!s.driveFileId) {
        setStatus('off')
        return
      }
      if (!s.lastSyncAt) {
        setStatus('stale')
        return
      }

      const ageMinutes = (Date.now() - new Date(s.lastSyncAt).getTime()) / 60000
      const threshold = s.standaloneMode === true
        ? Math.max(s.frequencyMinutes * 5, 10) // less strict when standalone (manual sync)
        : Math.max(s.frequencyMinutes * 1.5, 2) // stricter when in sync mode
      setStatus(ageMinutes <= threshold ? 'ok' : 'stale')
    } catch (err) {
      console.error('Error loading sync status:', err)
      setStatus('error')
    }
  }

  useEffect(() => {
    refresh()

    const interval = setInterval(refresh, 30_000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    const tick = setInterval(() => setNow(Date.now()), 1_000)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(tick)
    }
  }, [])

  const label = (() => {
    switch (status) {
      case 'ok':
        return 'מסונכרן'
      case 'stale':
        return 'דורש רענון'
      case 'error':
        // Check if it's an auth error
        if (settings?.lastSyncError === 'auth-required') {
          return 'נדרשת התחברות מחדש'
        }
        return 'שגיאה בסנכרון'
      case 'off':
        return 'לא מחובר ל-Drive'
      default:
        return 'בודק...'
    }
  })()

  const color = (() => {
    switch (status) {
      case 'ok':
        return '#16a34a'
      case 'stale':
        return '#f59e0b'
      case 'error':
        return '#ef4444'
      case 'off':
        return '#9ca3af'
      default:
        return '#9ca3af'
    }
  })()

  const lastSyncText = useMemo(() => {
    if (!settings?.lastSyncAt) return 'טרם סונכרן'
    return new Date(settings.lastSyncAt).toLocaleString('he-IL')
  }, [settings?.lastSyncAt])

  const nextSyncText = useMemo(() => {
    // Only show next sync if in sync mode (not standalone)
    if (settings?.standaloneMode === true || !settings?.frequencyMinutes || !settings?.lastSyncAt) return null
    const next = new Date(new Date(settings.lastSyncAt).getTime() + settings.frequencyMinutes * 60_000)
    const diffMs = next.getTime() - Date.now()
    if (diffMs <= 0) return 'מיידית'
    const mins = Math.max(1, Math.round(diffMs / 60_000))
    return `${mins} דק'`
  }, [settings?.standaloneMode, settings?.frequencyMinutes, settings?.lastSyncAt])

  const progress = useMemo(() => {
    // Only show progress if in sync mode (not standalone)
    if (settings?.standaloneMode === true || !settings?.frequencyMinutes || !settings?.lastSyncAt) return null
    const intervalMs = settings.frequencyMinutes * 60_000
    const elapsed = now - new Date(settings.lastSyncAt).getTime()
    return Math.max(0, Math.min(1, elapsed / intervalMs))
  }, [settings?.standaloneMode, settings?.frequencyMinutes, settings?.lastSyncAt, now])

  const icon = (() => {
    switch (status) {
      case 'ok':
        return '✅'
      case 'stale':
        return '⏳'
      case 'error':
        return '⚠️'
      case 'off':
        return '➕'
      default:
        return '…'
    }
  })()

  const tooltipText = (() => {
    if (settings?.lastSyncError === 'auth-required') {
      return `${label} • לחץ כדי להתחבר מחדש ל-Google Drive`
    }
    return `${label} • אחרון: ${lastSyncText}${nextSyncText ? ` • סנכרון הבא: ${nextSyncText}` : ''}`
  })()

  const handleClick = () => {
    if (settings?.lastSyncError === 'auth-required') {
      // Navigate to sync settings to re-authenticate
      window.location.href = '/tools/settings#sync'
    }
  }

  return (
    <div
      title={tooltipText}
      onClick={handleClick}
      style={{
        cursor: settings?.lastSyncError === 'auth-required' ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.35rem 0.6rem',
        borderRadius: '9999px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        fontSize: '0.85rem',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.25rem',
          height: '1.25rem',
          animation: status === 'stale' ? 'hourglassFlip 2s linear infinite' : 'none',
        }}
      >
        {status === 'stale' && progress !== null ? '⌛' : icon}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ color: '#111827' }}>{label}</span>
        {progress !== null && (
          <div style={{ marginTop: '0.2rem', width: '120px', height: '6px', background: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                background: '#f59e0b',
                transition: 'width 0.5s linear',
              }}
            />
          </div>
        )}
      </div>
      <span
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '9999px',
          backgroundColor: color,
          display: 'inline-block',
          marginInlineStart: '0.25rem',
        }}
      />
      <style jsx>{`
        @keyframes hourglassFlip {
          0% { transform: rotate(0deg); }
          50% { transform: rotate(180deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
