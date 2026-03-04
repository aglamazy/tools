'use client'

import { useState, useEffect } from 'react'
import {
  subscribeToAuth,
  getCachedAvatar,
  setCachedAvatar,
  clearCachedAvatar,
  type AuthUser,
} from '@/app/stores/authStore'
import { signOut, changePassword } from '@/app/services/firebaseAuthService'
import { isFirebaseConfigured } from '@/app/lib/firebase'
import { getSyncPassword } from './CloudSyncManager'
import AuthModal from './AuthModal'

type SyncIndicatorStatus = 'syncing' | 'inactive' | 'hidden'

function getInitialsAvatarUrl(email: string): string {
  const initial = (email.charAt(0) || '?').toUpperCase()
  return `https://ui-avatars.com/api/?name=${initial}&background=6366f1&color=fff&size=80&bold=true`
}

function getAvatarUrl(user: AuthUser): string {
  const email = user.email || ''
  // Use Firebase photoURL (from Google sign-in) if available
  if (user.photoURL) {
    setCachedAvatar(user.photoURL, email)
    return user.photoURL
  }
  // Fall back to initials
  const fallback = getInitialsAvatarUrl(email)
  setCachedAvatar(fallback, email)
  return fallback
}

function getSyncIndicatorStatus(user: AuthUser | null, isMounted: boolean): SyncIndicatorStatus {
  if (!user || !isMounted) return 'hidden'
  const hasPassword = !!getSyncPassword()
  return hasPassword ? 'syncing' : 'inactive'
}

function SyncIndicator({ status }: { status: SyncIndicatorStatus }) {
  if (status === 'hidden') return null

  const colors: Record<SyncIndicatorStatus, string> = {
    syncing: '#22c55e',  // green
    inactive: '#94a3b8', // gray
    hidden: 'transparent',
  }

  const titles: Record<SyncIndicatorStatus, string> = {
    syncing: 'סנכרון פעיל',
    inactive: 'סנכרון לא פעיל',
    hidden: '',
  }

  return (
    <div
      title={titles[status]}
      style={{
        position: 'absolute',
        bottom: '-2px',
        right: '-2px',
        width: '12px',
        height: '12px',
        background: colors[status],
        borderRadius: '50%',
        border: '2px solid white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }}
    />
  )
}

export default function AuthStatus() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpError, setCpError] = useState<string | null>(null)
  const [cpSuccess, setCpSuccess] = useState(false)
  const [cpLoading, setCpLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncIndicatorStatus>('hidden')
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setUser(state.user)
      setLoading(state.loading)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!isMounted) return
    setSyncStatus(getSyncIndicatorStatus(user, true))
  }, [user, isMounted])

  // Re-check sync status periodically (for password changes)
  useEffect(() => {
    if (!isMounted) return
    const interval = setInterval(() => {
      setSyncStatus(getSyncIndicatorStatus(user, true))
    }, 2000)
    return () => clearInterval(interval)
  }, [user, isMounted])

  if (!isFirebaseConfigured()) {
    return null
  }

  // Show cached avatar while loading for faster render (only after mount to avoid hydration mismatch)
  const cachedAvatar = isMounted ? getCachedAvatar() : null
  if (loading && cachedAvatar) {
    return (
      <div style={{ position: 'relative' }}>
        <button
          disabled
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            padding: 0,
            background: 'transparent',
            border: '2px solid #e0e7ff',
            borderRadius: '50%',
            cursor: 'default',
            overflow: 'hidden',
            opacity: 0.7,
          }}
        >
          <img
            src={cachedAvatar.url}
            alt=""
            width={32}
            height={32}
            style={{ borderRadius: '50%' }}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = getInitialsAvatarUrl(cachedAvatar.email)
            }}
          />
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>
        ...
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowAuthModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.75rem',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          התחבר
        </button>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </>
    )
  }

  const handleSignOut = async () => {
    setShowMenu(false)
    clearCachedAvatar()
    await signOut()
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setCpError(null)
    setCpSuccess(false)
    setCpLoading(true)
    try {
      const result = await changePassword(cpCurrent, cpNew)
      if (result.success) {
        setCpSuccess(true)
        setCpCurrent('')
        setCpNew('')
      } else {
        setCpError(result.error || 'שגיאה בשינוי סיסמה')
      }
    } finally {
      setCpLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        title={user.email || ''}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          padding: 0,
          background: 'transparent',
          border: '2px solid #e0e7ff',
          borderRadius: '50%',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        <img
          src={getAvatarUrl(user)}
          alt=""
          width={32}
          height={32}
          style={{ borderRadius: '50%' }}
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = getInitialsAvatarUrl(user.email || '')
          }}
        />
      </button>
      <SyncIndicator status={syncStatus} />

      {showMenu && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99,
            }}
            onClick={() => setShowMenu(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.5rem',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              zIndex: 100,
              minWidth: '180px',
            }}
          >
            <div
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid #e5e7eb',
                fontSize: '0.85rem',
                color: '#6b7280',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.email}
            </div>
            <button
              onClick={() => { setShowMenu(false); setShowChangePassword(true); setCpError(null); setCpSuccess(false) }}
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: '1px solid #e5e7eb', color: '#374151', fontSize: '0.9rem', cursor: 'pointer', textAlign: 'right' }}
            >
              שנה סיסמה
            </button>
            <button
              onClick={handleSignOut}
              style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', color: '#dc2626', fontSize: '0.9rem', cursor: 'pointer', textAlign: 'right' }}
            >
              התנתק
            </button>
          </div>
        </>
      )}

      {/* Change password inline panel */}
      {showChangePassword && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowChangePassword(false)} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 100, width: '240px', padding: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>שנה סיסמה</div>
            {cpSuccess ? (
              <div style={{ color: '#16a34a', fontSize: '0.875rem', textAlign: 'center', padding: '0.5rem 0' }}>הסיסמה שונתה בהצלחה</div>
            ) : (
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {cpError && <div style={{ color: '#dc2626', fontSize: '0.8rem' }}>{cpError}</div>}
                <input
                  type="password"
                  placeholder="סיסמה נוכחית"
                  value={cpCurrent}
                  onChange={(e) => setCpCurrent(e.target.value)}
                  required
                  dir="ltr"
                  style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                />
                <input
                  type="password"
                  placeholder="סיסמה חדשה"
                  value={cpNew}
                  onChange={(e) => setCpNew(e.target.value)}
                  required
                  dir="ltr"
                  style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                />
                <button
                  type="submit"
                  disabled={cpLoading}
                  style={{ padding: '0.5rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: cpLoading ? 'not-allowed' : 'pointer', opacity: cpLoading ? 0.7 : 1 }}
                >
                  {cpLoading ? '...' : 'שמור'}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  )
}
