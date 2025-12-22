'use client'

import { useState, useEffect } from 'react'
import { driveAuthStore } from '@/app/stores/driveAuthStore'
import { interactiveConnectAndExport } from '@/app/services/driveSyncService'
import { getDriveSyncSettings, setDriveSyncSettings } from '@/app/services/appSettingsService'

type SetupMode = 'checking' | 'needs-decision' | 'ready'

/**
 * Drive Setup Gate
 * Shows decision screen on first launch: Standalone vs Multi-device sync
 * Blocks app until user decides
 */
export default function DriveSetupGate({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<SetupMode>('checking')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    if (!clientId) {
      // No Google Client ID - must work standalone
      setMode('ready')
      return
    }

    // Check if user has made a decision before
    const settings = await getDriveSyncSettings()
    const hasToken = !!driveAuthStore.get()

    if (settings.standaloneMode === true || hasToken) {
      // User chose standalone OR has connected before
      setMode('ready')
      return
    }

    // First time user - needs to decide
    setMode('needs-decision')
  }

  const handleStandalone = async () => {
    // Mark as standalone mode
    const settings = await getDriveSyncSettings()
    await setDriveSyncSettings({
      ...settings,
      standaloneMode: true,
    })
    setMode('ready')
  }

  const handleConnectDrive = async () => {
    if (!clientId) return

    setConnecting(true)
    setError(null)

    try {
      const result = await interactiveConnectAndExport({
        clientId,
        useAppData: true,
        fileName: 'finance-backup.json',
      })

      if (result.success) {
        // Save settings
        const settings = await getDriveSyncSettings()
        await setDriveSyncSettings({
          ...settings,
          driveFileId: result.fileId,
          lastSyncAt: new Date().toISOString(),
          standaloneMode: false,
        })
        setMode('ready')
      } else {
        if (result.error === 'popup-blocked') {
          setError('הדפדפן חסם את חלון ההתחברות. אנא אפשר חלונות קופצים ונסה שוב.')
        } else if (result.error === 'empty-backup') {
          setError('הגיבוי ריק. זהו התקנה חדשה - תמשיך.')
          // Allow continuing anyway for new installation
          setTimeout(() => setMode('ready'), 2000)
        } else {
          setError('חיבור נכשל. נסה שוב או עבוד במצב עצמאי.')
        }
      }
    } catch (err: any) {
      console.error('Drive connect error:', err)
      setError('שגיאה בחיבור. נסה שוב או עבוד במצב עצמאי.')
    } finally {
      setConnecting(false)
    }
  }

  // Show loading while checking
  if (mode === 'checking') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ color: '#64748b' }}>טוען...</div>
        </div>
      </div>
    )
  }

  // Show decision screen
  if (mode === 'needs-decision') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            background: 'white',
            padding: '3rem',
            borderRadius: '1rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            maxWidth: '500px',
            width: '100%',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
            <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>ארגז כלים פיננסיים</h1>
            <p style={{ color: '#64748b', margin: 0 }}>כלים לניהול תקציב ומעקב זמנים</p>
          </div>

          <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem' }}>האם אתה משתמש בכלי במספר מכשירים?</h2>
            <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
              אם אתה עובד ממספר מחשבים (למשל בית ועבודה), חבר את Google Drive לסנכרון אוטומטי.
              אחרת, עבוד במצב עצמאי (הנתונים יישארו רק במכשיר זה).
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              onClick={handleConnectDrive}
              disabled={connecting}
              style={{
                padding: '1rem',
                fontSize: '1rem',
                background: connecting ? '#94a3b8' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: connecting ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              {connecting ? '⏳ מתחבר...' : '✓ כן - חבר Google Drive'}
            </button>

            <button
              onClick={handleStandalone}
              disabled={connecting}
              style={{
                padding: '1rem',
                fontSize: '1rem',
                background: 'white',
                color: '#475569',
                border: '2px solid #e2e8f0',
                borderRadius: '0.5rem',
                cursor: connecting ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              לא - עבוד במצב עצמאי
            </button>
          </div>

          {error && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                color: '#dc2626',
                fontSize: '0.875rem',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#94a3b8' }}>
            ניתן לשנות את ההגדרה מאוחר יותר בהגדרות
          </div>
        </div>
      </div>
    )
  }

  // Ready - show the app
  return <>{children}</>
}
