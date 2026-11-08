'use client'

import { useState, useEffect } from 'react'
import { subscribeToAuth, type AuthUser } from '@/app/stores/authStore'
import {
  isCloudBackupAvailable,
  hasEncryptionPasswordSetup,
  uploadBackup,
  getBackupInfo,
  isUsingHouseholdStorage,
  migrateToHouseholdStorage,
  type CloudBackupInfo,
} from '@/app/services/cloudBackupService'
import { exportAllStores } from '@/app/services/backupService'
import { SYNCED_DB_TABLES } from '@/app/services/syncedTables'
import { signOut } from '@/app/services/firebaseAuthService'
import { getFirebaseAuth, isFirebaseConfigured } from '@/app/lib/firebase'
import { getTierFromUser } from '@/app/services/backupSizeLimit'
import { startUpload, runSyncAction, type SyncAction, type SyncActionUi } from './cloudSyncActions'
import { backupSizeLimitSuffix, storageLimitNote } from './backupLimitText'
import { getSyncPassword, setSyncPassword } from '../../CloudSyncManager'
import AuthModal from '../../AuthModal'
import EncryptionPasswordModal from '../../EncryptionPasswordModal'
import YesNoModal from '../../YesNoModal'

type SyncStatus = 'idle' | 'uploading' | 'downloading' | 'error'

export default function CloudSyncSection() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordMode, setPasswordMode] = useState<'setup' | 'enter'>('setup')
  const [pendingAction, setPendingAction] = useState<SyncAction | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [backupInfo, setBackupInfo] = useState<CloudBackupInfo | null>(null)
  const [hasSessionPassword, setHasSessionPassword] = useState(false)
  const [hasEncryption, setHasEncryption] = useState(false)
  // Set when verify.enc could not be read (403/network): the backup is
  // unreachable, NOT "no password" — never offer setup then (aglamazo#461).
  const [backupAccessError, setBackupAccessError] = useState<string | null>(null)
  // Uploader tier claim; null while loading (aglamazo#461 size-limit text).
  const [tier, setTier] = useState<string | undefined | null>(null)
  const [isHousehold, setIsHousehold] = useState(false)
  const [showForceUploadConfirm, setShowForceUploadConfirm] = useState(false)
  const [forceUploading, setForceUploading] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToAuth((state) => {
      setUser(state.user)
      setAuthLoading(state.loading)
    })
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
        const [setup, household] = await Promise.all([
          hasEncryptionPasswordSetup(),
          isUsingHouseholdStorage(),
        ])
        applyEncryptionState(setup)
        setIsHousehold(household)
        setTier(isFirebaseConfigured() ? await getTierFromUser(getFirebaseAuth().currentUser) : undefined)
      } else {
        setHasEncryption(false)
        setBackupAccessError(null)
        setIsHousehold(false)
        setTier(null)
      }
    }
    checkEncryption()
  }, [user])

  const applyEncryptionState = (setup: Awaited<ReturnType<typeof hasEncryptionPasswordSetup>>) => {
    setHasEncryption(setup.state === 'present')
    setBackupAccessError(setup.state === 'error' ? setup.error : null)
  }

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

  const actionUi: SyncActionUi = {
    setMessage,
    setSyncStatus,
    openPasswordModal: (mode, action) => {
      setPasswordMode(mode)
      setPendingAction(action)
      setShowPasswordModal(true)
    },
    onUploadSuccess: async (password) => {
      setSyncPassword(password) // Store in session for auto-sync
      setHasSessionPassword(true)
      setHasEncryption(true)
      setBackupAccessError(null)
      // Show record counts
      const backup = await exportAllStores()
      const counts = SYNCED_DB_TABLES
        .map(name => ({ name, count: ((backup.stores as any)[name] || []).length }))
        .filter(t => t.count > 0)
        .map(t => `${t.name}: ${t.count}`)
        .join(', ')
      setMessage(`סנכרון הושלם! סנכרון אוטומטי מופעל.\n${counts}`)
      loadBackupInfo()
    },
    onDownloadSuccess: (password) => {
      setSyncPassword(password) // Store in session for auto-sync
      setHasSessionPassword(true)
      setMessage('הנתונים שוחזרו בהצלחה! הדף יטען מחדש.')
      setTimeout(() => window.location.reload(), 2000)
    },
  }

  const handleUpload = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }
    setMessage(null)
    await startUpload(actionUi, getSyncPassword())
  }

  const handleDownload = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    actionUi.openPasswordModal('enter', 'download')
  }

  // Password modal success: the action was captured when the modal opened.
  const handlePasswordSuccess = async (password: string) => {
    const action = pendingAction
    setPendingAction(null)
    if (!action) {
      console.error('[CloudSyncSection] Password entered with no pending action')
      return
    }
    await runSyncAction(action, password, actionUi)
  }

  const handleForceUpload = async () => {
    const password = getSyncPassword()
    if (!password) {
      setMessage('נדרשת סיסמה פעילה בסשן כדי לאלץ העלאה')
      return
    }
    setShowForceUploadConfirm(false)
    setForceUploading(true)
    setMessage(null)
    try {
      const result = await uploadBackup(password)
      if (result.success) {
        setMessage('הגיבוי בענן נדרס בהצלחה עם הנתונים המקומיים!')
        loadBackupInfo()
      } else {
        setMessage(result.error || 'שגיאה באילוץ ההעלאה')
      }
    } finally {
      setForceUploading(false)
    }
  }

  // Success messages are the known few; anything else (access refused, wrong
  // password, size limit) is an error even without the word 'שגיאה'.
  const messageIsError = !!message && !/^(סנכרון הושלם|הנתונים שוחזרו|הגיבוי בענן נדרס|הגיבוי הועבר)/.test(message)

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
                {!hasEncryption && !backupAccessError && !hasSessionPassword && ' יש לקבל את סיסמת ההצפנה מהשותף/ה ולשחזר מהענן.'}
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
              ...(hasSessionPassword && !backupAccessError
                ? { background: '#dcfce7', border: '1px solid #86efac', color: '#166534' }
                : backupAccessError || !hasEncryption
                  ? { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
                  : { background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }),
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                flexShrink: 0,
                background: hasSessionPassword && !backupAccessError
                  ? '#22c55e'
                  : '#ef4444',
              }}
            />
            <span style={{ fontWeight: 500 }}>
              {backupAccessError
                ? backupAccessError
                : !hasEncryption
                ? 'נדרשת הגדרת סיסמת הצפנה'
                : !hasSessionPassword
                  ? 'נדרשת הזנת סיסמה לסנכרון'
                  : 'סנכרון אוטומטי פעיל'}
            </span>
            {!hasEncryption && !backupAccessError && (
              <button
                onClick={() => actionUi.openPasswordModal('setup', 'upload')}
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
                הגדר סיסמה
              </button>
            )}
            {hasEncryption && !hasSessionPassword && (
              <button
                onClick={() => actionUi.openPasswordModal('enter', 'upload')}
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
                  <span style={{ color: '#64748b' }}>{backupSizeLimitSuffix(tier)}</span>
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

            {hasSessionPassword && (
              <button
                onClick={() => setShowForceUploadConfirm(true)}
                className="file-picker"
                style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                }}
                disabled={syncStatus !== 'idle' || forceUploading}
                title="דורס את הגיבוי בענן עם הנתונים המקומיים בלי להוריד/למזג קודם — לשימוש רק כשהגיבוי בענן פגום"
              >
                {forceUploading ? 'דורס...' : 'אילוץ העלאה (דריסה מלאה)'}
              </button>
            )}
          </div>

          <YesNoModal
            isOpen={showForceUploadConfirm}
            question="פעולה זו תדרוס את הגיבוי בענן עם הנתונים המקומיים בלבד, בלי להוריד/למזג נתונים מהענן קודם. השתמש בזה רק אם הגיבוי בענן פגום. האם להמשיך?"
            onYes={handleForceUpload}
            onNo={() => setShowForceUploadConfirm(false)}
          />

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
                    applyEncryptionState(await hasEncryptionPasswordSetup())
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
                background: messageIsError ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${messageIsError ? '#fecaca' : '#86efac'}`,
                borderRadius: '0.5rem',
                color: messageIsError ? '#dc2626' : '#166534',
                fontSize: '0.9rem',
              }}
            >
              {message.split('\n').map((line, i) => (
              <div key={i} style={i > 0 ? { fontSize: '0.8rem', marginTop: '0.375rem', color: '#475569', direction: 'ltr', textAlign: 'left' } : undefined}>{line}</div>
            ))}
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
            {storageLimitNote(tier, isHousehold)}
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
