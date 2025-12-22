import { useState } from 'react'
import type { DriveSyncSettings } from '@/app/services/appSettingsService'
import { config } from '@/app/config'
import Modal from '../../Modal'

type SyncStatus = 'idle' | 'connecting' | 'saving' | 'error'

type DriveBackupInfo = {
  fileId?: string
  modifiedTime?: string
  fetchedAt?: string
  error?: string
  loading?: boolean
  storeCounts?: {
    transactions: number
    importedFiles: number
    categories: number
    businessCategories: number
    tasks: number
    appSettings: number
    businesses: number
    projects: number
    harvestTasks: number
    timeEntries: number
  }
  totalSizeBytes?: number
  backupVersion?: string
  backupTimestamp?: string
}

type DriveSyncSectionProps = {
  googleClientId: string
  driveSyncSettings: DriveSyncSettings
  syncStatus: SyncStatus
  syncMessage: string
  driveBackupInfo: DriveBackupInfo | null
  lockMode: 'initializing' | 'master' | 'slave'
  onConnect: () => void
  onManualSync: () => void
  onToggleStandaloneMode: () => void
  onFrequencyChange: (value: number) => void
  onCheckBackupInfo: () => void
}

export default function DriveSyncSection({
  googleClientId,
  driveSyncSettings,
  syncStatus,
  syncMessage,
  driveBackupInfo,
  lockMode,
  onConnect,
  onManualSync,
  onToggleStandaloneMode,
  onFrequencyChange,
  onCheckBackupInfo,
}: DriveSyncSectionProps) {
  const [showBackupModal, setShowBackupModal] = useState(false)
  const isMaster = lockMode === 'master'
  const isSlave = lockMode === 'slave'
  const isStandalone = driveSyncSettings.standaloneMode === true
  const hasAuth = !!driveSyncSettings.driveFileId

  const handleInfoClick = () => {
    setShowBackupModal(true)
    onCheckBackupInfo()
  }

  return (
    <section style={{ marginBottom: '2rem', padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#f8fafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>סנכרון וגיבוי</h2>
        {!isStandalone && (
          <div
            title="הצג מידע על הגיבוי ב-Drive"
            onClick={handleInfoClick}
            style={{
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#e0f2fe',
              color: '#0369a1',
              fontSize: '0.85rem',
              fontWeight: 600,
              border: '1px solid #bae6fd',
            }}
          >
            ⓘ
          </div>
        )}
      </div>

      {/* Toggle between Standalone and Google Sync */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!isStandalone}
            onChange={onToggleStandaloneMode}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
          />
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 500 }}>
              {isStandalone ? '🔒 מצב עצמאי' : '☁️ סנכרון Google Drive'}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
              {isStandalone
                ? 'אחראי על גיבוי הנתונים באופן ידני'
                : 'גיבוי אוטומטי לתיקיית appData בחשבון Google Drive שלך'}
            </div>
          </div>
        </label>
      </div>

      {/* Google Sync Controls - only show when not standalone */}
      {!isStandalone && (
        <>
          {!googleClientId && (
            <p style={{ margin: '0 0 1rem 0', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#b91c1c', fontSize: '0.9rem' }}>
              חסר NEXT_PUBLIC_GOOGLE_CLIENT_ID בקובץ הסביבה
            </p>
          )}

          {driveSyncSettings?.lastSyncError && (
            <p style={{ margin: '0 0 1rem 0', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#b91c1c', fontSize: '0.9rem' }}>
              שגיאה: {driveSyncSettings.lastSyncError}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {!hasAuth && (
              <button
                onClick={onConnect}
                className="file-picker"
                style={{ background: '#0ea5e9', color: 'white' }}
                disabled={syncStatus !== 'idle'}
              >
                התחברות + שמירה
              </button>
            )}
            {hasAuth && (
              <button
                onClick={onManualSync}
                className="file-picker"
                style={{ background: '#10b981', color: 'white' }}
                disabled={syncStatus !== 'idle'}
              >
                שמור עכשיו
              </button>
            )}
            {syncStatus !== 'idle' && (
              <span style={{ fontSize: '0.9rem', color: '#2563eb', padding: '0.5rem' }}>
                {syncStatus === 'connecting' ? 'מתחבר...' : syncStatus === 'saving' ? 'שומר...' : 'שגיאה'}
              </span>
            )}
          </div>

          {driveSyncSettings?.lastSyncAt && (
            <p style={{ margin: '0 0 1rem 0', color: '#065f46', fontSize: '0.9rem' }}>
              סנכרון אחרון: {new Date(driveSyncSettings.lastSyncAt).toLocaleString('he-IL')}
            </p>
          )}

          {/* Master/Slave status and frequency */}
          {isMaster && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#166534' }}>📤 תחנה ראשית - סנכרון אוטומטי כל</span>
              <input
                type="number"
                min={1}
                value={driveSyncSettings!.frequencyMinutes}
                onChange={(e) => onFrequencyChange(Number(e.target.value))}
                style={{ width: '70px', padding: '0.35rem', borderRadius: '0.375rem', border: '1px solid #86efac', direction: 'ltr', fontWeight: 600 }}
              />
              <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#166534' }}>דקות</span>
            </div>
          )}
          {isSlave && (
            <div style={{ padding: '0.75rem', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '0.5rem' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#92400e' }}>📥 תחנה משנית - מצב קריאה בלבד</span>
            </div>
          )}
        </>
      )}

      {/* Backup Info Modal */}
      <Modal isOpen={showBackupModal} onClose={() => setShowBackupModal(false)} maxWidth="500px">
        <div style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: 600 }}>מידע על הגיבוי ב-Drive</h3>

          {driveBackupInfo?.loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              <div>טוען מידע...</div>
            </div>
          )}

          {driveBackupInfo && !driveBackupInfo.loading && driveBackupInfo.error && (
            <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#b91c1c' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>⚠️ שגיאה</div>
              <div>{driveBackupInfo.error}</div>
            </div>
          )}

          {driveBackupInfo && !driveBackupInfo.loading && driveBackupInfo.storeCounts && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ padding: '0.75rem', background: '#f0f9ff', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>עסקאות</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#0369a1' }}>
                    {driveBackupInfo.storeCounts.transactions.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>קבצים מיובאים</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#166534' }}>
                    {driveBackupInfo.storeCounts.importedFiles.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>קטגוריות</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#92400e' }}>
                    {driveBackupInfo.storeCounts.categories.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: '#fdf4ff', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>עסקים</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#7e22ce' }}>
                    {driveBackupInfo.storeCounts.businesses.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: '#fef3f2', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>פרויקטים</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#dc2626' }}>
                    {driveBackupInfo.storeCounts.projects.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>רשומות זמן</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1d4ed8' }}>
                    {driveBackupInfo.storeCounts.timeEntries.toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', fontSize: '0.9rem', color: '#64748b' }}>
                {driveBackupInfo.modifiedTime && (
                  <div style={{ marginBottom: '0.25rem' }}>
                    <strong>עודכן לאחרונה:</strong> {new Date(driveBackupInfo.modifiedTime).toLocaleString('he-IL')}
                  </div>
                )}
                {driveBackupInfo.totalSizeBytes && (
                  <div>
                    <strong>גודל:</strong> {(driveBackupInfo.totalSizeBytes / 1024).toFixed(1)} KB
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowBackupModal(false)}
                style={{
                  marginTop: '1rem',
                  width: '100%',
                  padding: '0.75rem',
                  background: '#0ea5e9',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 500,
                }}
              >
                סגור
              </button>
            </>
          )}
        </div>
      </Modal>
    </section>
  )
}
