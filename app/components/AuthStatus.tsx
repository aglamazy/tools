'use client'

import { useState, useEffect } from 'react'
import {
  subscribeToAuth,
  getCachedAvatar,
  setCachedAvatar,
  clearCachedAvatar,
  type AuthUser,
} from '@/app/stores/authStore'
import { signOut } from '@/app/services/firebaseAuthService'
import { isFirebaseConfigured } from '@/app/lib/firebase'
import AuthModal from './AuthModal'

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

export default function AuthStatus() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setUser(state.user)
      setLoading(state.loading)
    })
    return unsubscribe
  }, [])

  if (!isFirebaseConfigured()) {
    return null
  }

  // Show cached avatar while loading for faster render
  const cachedAvatar = getCachedAvatar()
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
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: '#dc2626',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textAlign: 'right',
              }}
            >
              התנתק
            </button>
          </div>
        </>
      )}
    </div>
  )
}
