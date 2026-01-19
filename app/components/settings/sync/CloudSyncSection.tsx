'use client'

import { useState, useEffect } from 'react'
import { subscribeToAuth, type AuthUser } from '@/app/stores/authStore'
import {
  isCloudBackupAvailable,
  hasEncryptionPasswordSetup,
  uploadBackup,
  restoreFromCloud,
  getBackupInfo,
  type CloudBackupInfo,
} from '@/app/services/cloudBackupService'
import { signOut } from '@/app/services/firebaseAuthService'
import AuthModal from '../../AuthModal'
import EncryptionPasswordModal from '../../EncryptionPasswordModal'

type SyncStatus = 'idle' | 'uploading' | 'downloading' | 'error'

export default function CloudSyncSection() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordMode, setPasswordMode] = useState<'setup' | 'enter'>('setup')
  const [pendingAction, setPendingAction] = useState<'upload' | 'download' | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [backupInfo, setBackupInfo] = useState<CloudBackupInfo | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setUser(state.user)
      setAuthLoading(state.loading)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (user) {
      loadBackupInfo()
    } else {
      setBackupInfo(null)
    }
  }, [user])

  const loadBackupInfo = async () => {
    const info = await getBackupInfo()
    setBackupInfo(info)
  }

  const handleSignOut = async () => {
    await signOut()
    setMessage(null)
  }

  const handleUpload = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    // Check if encryption password is set up
    const hasPassword = await hasEncryptionPasswordSetup()
    if (!hasPassword) {
      setPasswordMode('setup')
      setPendingAction('upload')
      setShowPasswordModal(true)
      return
    }

    // Ask for password
    setPasswordMode('enter')
    setPendingAction('upload')
    setShowPasswordModal(true)
  }

  const handleDownload = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    setPasswordMode('enter')
    setPendingAction('download')
    setShowPasswordModal(true)
  }

  const handlePasswordSuccess = async (password: string) => {
    if (!pendingAction) return

    setMessage(null)

    if (pendingAction === 'upload') {
      setSyncStatus('uploading')
      const result = await uploadBackup(password)
      setSyncStatus('idle')

      if (result.success) {
        setMessage('הגיבוי הועלה בהצלחה!')
        loadBackupInfo()
      } else {
        setMessage(result.error || 'שגיאה בהעלאת הגיבוי')
      }
    } else if (pendingAction === 'download') {
      setSyncStatus('downloading')
      const result = await restoreFromCloud(password)
      setSyncStatus('idle')

      if (result.success) {
        setMessage('הנתונים שוחזרו בהצלחה! הדף יטען מחדש.')
        setTimeout(() => window.location.reload(), 2000)
      } else {
        setMessage(result.error || 'שגיאה בשחזור הנתונים')
      }
    }

    setPendingAction(null)
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  const formatDate = (isoString: string): string => {
    return new Date(isoString).toLocaleString('he-IL')
  }

  return (
    <section
      style={{
        marginBottom: '2rem',
        padding: '1.5rem',
        border: '1px solid #e2e8f0',
        borderRadius: '0.75rem',
        background: '#f8fafc',
      }}
    >
      <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
        גיבוי בענן
      </h2>

      {authLoading ? (
        <div style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>
          טוען...
        </div>
      ) : !user ? (
        <>
          <p style={{ margin: '0 0 1rem 0', color: '#64748b', fontSize: '0.95rem' }}>
            התחבר כדי לגבות את הנתונים שלך בענן בצורה מאובטחת ומוצפנת.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="file-picker"
            style={{ background: '#3b82f6', color: 'white' }}
          >
            התחבר / הרשם
          </button>
        </>
      ) : (
        <>
          {/* User info */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              padding: '0.75rem',
              background: '#ecfdf5',
              border: '1px solid #86efac',
              borderRadius: '0.5rem',
            }}
          >
            <div>
              <span style={{ fontWeight: 500, color: '#166534' }}>מחובר: </span>
              <span style={{ color: '#166534' }}>{user.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              style={{
                background: 'none',
                border: 'none',
                color: '#dc2626',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textDecoration: 'underline',
              }}
            >
              התנתק
            </button>
          </div>

          {/* Backup info */}
          {backupInfo?.exists && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
              }}
            >
              <div style={{ marginBottom: '0.25rem' }}>
                <strong>גיבוי אחרון:</strong> {backupInfo.lastModified ? formatDate(backupInfo.lastModified) : 'לא ידוע'}
              </div>
              <div>
                <strong>גודל:</strong> {backupInfo.sizeBytes ? formatSize(backupInfo.sizeBytes) : 'לא ידוע'}
                <span style={{ color: '#64748b' }}> / 2.5 MB</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleUpload}
              className="file-picker"
              style={{ background: '#10b981', color: 'white' }}
              disabled={syncStatus !== 'idle'}
            >
              {syncStatus === 'uploading' ? 'מעלה...' : 'העלה גיבוי'}
            </button>

            <button
              onClick={handleDownload}
              className="file-picker"
              style={{
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
              }}
              disabled={syncStatus !== 'idle' || !backupInfo?.exists}
            >
              {syncStatus === 'downloading' ? 'מוריד...' : 'שחזר מהענן'}
            </button>
          </div>

          {/* Message */}
          {message && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: message.includes('שגיאה') ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${message.includes('שגיאה') ? '#fecaca' : '#86efac'}`,
                borderRadius: '0.5rem',
                color: message.includes('שגיאה') ? '#dc2626' : '#166534',
                fontSize: '0.9rem',
              }}
            >
              {message}
            </div>
          )}

          {/* Storage limit note */}
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '0.5rem',
              fontSize: '0.85rem',
              color: '#92400e',
            }}
          >
            מגבלת אחסון בחינם: 2.5 MB. הנתונים מוצפנים בסיסמה שרק אתה יודע.
          </div>
        </>
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          setShowAuthModal(false)
          loadBackupInfo()
        }}
      />

      <EncryptionPasswordModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false)
          setPendingAction(null)
        }}
        mode={passwordMode}
        onSuccess={handlePasswordSuccess}
      />
    </section>
  )
}
