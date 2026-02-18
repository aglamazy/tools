'use client'

import { useState, useEffect } from 'react'
import { subscribeToAuth, type AuthUser } from '@/app/stores/authStore'
import { lockModeStore } from '@/app/stores/lockModeStore'
import {
  isCloudBackupAvailable,
  hasEncryptionPasswordSetup,
  uploadBackup,
  restoreFromCloud,
  getBackupInfo,
  isUsingHouseholdStorage,
  migrateToHouseholdStorage,
  type CloudBackupInfo,
} from '@/app/services/cloudBackupService'
import { signOut } from '@/app/services/firebaseAuthService'
import { getSyncPassword, setSyncPassword } from '../../CloudSyncManager'
import AuthModal from '../../AuthModal'
import EncryptionPasswordModal from '../../EncryptionPasswordModal'

type SyncStatus = 'idle' | 'uploading' | 'downloading' | 'error'
type LockMode = 'initializing' | 'master' | 'slave'

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
  const [lockMode, setLockMode] = useState<LockMode>('initializing')
  const [hasSessionPassword, setHasSessionPassword] = useState(false)
  const [hasEncryption, setHasEncryption] = useState(false)
  const [isHousehold, setIsHousehold] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setUser(state.user)
      setAuthLoading(state.loading)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = lockModeStore.subscribe((mode) => {
      setLockMode(mode)
    })
    setLockMode(lockModeStore.get())
    return unsubscribe
  }, [])

  useEffect(() => {
    const checkPassword = () => {
      setHasSessionPassword(!!getSyncPassword())
    }
    checkPassword()
    // Re-check when user changes or after password actions
    const interval = setInterval(checkPassword, 2000)
    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    const checkEncryption = async () => {
      if (user) {
        const [has, household] = await Promise.all([
          hasEncryptionPasswordSetup(),
          isUsingHouseholdStorage(),
        ])
        setHasEncryption(has)
        setIsHousehold(household)
      } else {
        setHasEncryption(false)
        setIsHousehold(false)
      }
    }
    checkEncryption()
  }, [user])

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

    // Check if password already stored in session
    const storedPassword = getSyncPassword()
    if (storedPassword) {
      // Use stored password directly
      setPendingAction('upload')
      await handlePasswordSuccess(storedPassword)
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
    const action = pendingAction // Capture before it gets cleared
    if (!action) return

    setMessage(null)

    if (action === 'upload') {
      setSyncStatus('uploading')
      const result = await uploadBackup(password)
      setSyncStatus('idle')

      if (result.success) {
        setSyncPassword(password) // Store in session for auto-sync
        setHasSessionPassword(true)
        setHasEncryption(true)
        setMessage('הגיבוי הועלה בהצלחה! סנכרון אוטומטי מופעל.')
        loadBackupInfo()
      } else {
        setMessage(result.error || 'שגיאה בהעלאת הגיבוי')
      }
    } else if (action === 'download') {
      setSyncStatus('downloading')
      const result = await restoreFromCloud(password)
      setSyncStatus('idle')

      if (result.success) {
        setSyncPassword(password) // Store in session for auto-sync
        setHasSessionPassword(true)
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

          {/* Household notice */}
          {isHousehold && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
                color: '#1e40af',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>🏠</span>
              <span>
                <strong>משק בית משותף</strong> — הגיבוי משותף עם בן/בת הזוג.
                {!hasEncryption && !hasSessionPassword && ' יש לקבל את סיסמת ההצפנה מהשותף/ה ולשחזר מהענן.'}
                {hasEncryption && !hasSessionPassword && ' הזן את סיסמת ההצפנה המשותפת כדי לסנכרן.'}
              </span>
            </div>
          )}

          {/* Sync Status Indicator */}
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              ...(lockMode === 'master' && hasSessionPassword
                ? { background: '#dcfce7', border: '1px solid #86efac', color: '#166534' }
                : lockMode === 'slave'
                  ? { background: '#fef3c7', border: '1px solid #fbbf24', color: '#92400e' }
                  : !hasEncryption
                    ? { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
                    : !hasSessionPassword
                      ? { background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }
                      : { background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569' }),
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                flexShrink: 0,
                background:
                  lockMode === 'master' && hasSessionPassword
                    ? '#22c55e'
                    : lockMode === 'slave'
                      ? '#f59e0b'
                      : !hasEncryption || !hasSessionPassword
                        ? '#ef4444'
                        : '#94a3b8',
              }}
            />
            <span style={{ fontWeight: 500 }}>
              {lockMode === 'initializing'
                ? 'מאתחל...'
                : lockMode === 'slave'
                  ? 'קריאה בלבד - תחנה אחרת פעילה'
                  : !hasEncryption
                    ? 'נדרשת הגדרת סיסמת הצפנה'
                    : !hasSessionPassword
                      ? 'נדרשת הזנת סיסמה לסנכרון'
                      : 'סנכרון אוטומטי פעיל'}
            </span>
            {lockMode === 'master' && hasEncryption && !hasSessionPassword && (
              <button
                onClick={() => {
                  setPasswordMode('enter')
                  setPendingAction('upload')
                  setShowPasswordModal(true)
                }}
                style={{
                  marginRight: 'auto',
                  padding: '0.25rem 0.75rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                הזן סיסמה
              </button>
            )}
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
                <strong>גודל:</strong>{' '}
                <span dir="ltr" style={{ display: 'inline-block' }}>
                  {backupInfo.sizeBytes ? formatSize(backupInfo.sizeBytes) : 'לא ידוע'}
                  <span style={{ color: '#64748b' }}> / 2.5 MB</span>
                </span>
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

          {/* Household: no backup yet — offer migration */}
          {isHousehold && !backupInfo?.exists && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: '#fefce8',
                border: '1px solid #fef08a',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
                color: '#854d0e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <span>אין עדיין גיבוי משותף. אם יש לך גיבוי אישי קיים, ניתן להעביר אותו.</span>
              <button
                onClick={async () => {
                  setSyncStatus('uploading')
                  setMessage(null)
                  const result = await migrateToHouseholdStorage()
                  setSyncStatus('idle')
                  if (result.success) {
                    setMessage('הגיבוי הועבר לאחסון המשותף!')
                    loadBackupInfo()
                    const has = await hasEncryptionPasswordSetup()
                    setHasEncryption(has)
                  } else {
                    setMessage(result.error || 'לא נמצא גיבוי אישי להעברה')
                  }
                }}
                disabled={syncStatus !== 'idle'}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.85rem',
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                העבר גיבוי
              </button>
            </div>
          )}

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
            {isHousehold
              ? 'מגבלת אחסון בחינם: 2.5 MB. הנתונים מוצפנים בסיסמה משותפת למשק הבית.'
              : 'מגבלת אחסון בחינם: 2.5 MB. הנתונים מוצפנים בסיסמה שרק אתה יודע.'}
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
