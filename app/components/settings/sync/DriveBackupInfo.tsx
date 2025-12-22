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

type DriveBackupInfoProps = {
  backupInfo: DriveBackupInfo | null
  driveFileId?: string
  remoteModifiedAt?: string
  onCheck: () => void
  disabled: boolean
}

const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('he-IL') : '—')

export default function DriveBackupInfoSection({ backupInfo, driveFileId, remoteModifiedAt, onCheck, disabled }: DriveBackupInfoProps) {
  return (
    <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.95rem', color: '#0f172a' }}>מידע על קובץ הגיבוי ב-Drive</div>
        <button onClick={onCheck} className="file-picker secondary" style={{ flexShrink: 0 }} disabled={disabled}>
          בדוק קובץ ב-Drive
        </button>
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#111827' }}>
        <div>מזהה קובץ: {backupInfo?.fileId || driveFileId || '—'}</div>
        <div>עודכן ב-Drive: {formatTime(backupInfo?.modifiedTime || remoteModifiedAt)}</div>
        <div>בדיקה אחרונה: {formatTime(backupInfo?.fetchedAt)}</div>
        {backupInfo?.backupVersion && (
          <div>גרסת גיבוי: {backupInfo.backupVersion} | נוצר: {formatTime(backupInfo.backupTimestamp)}</div>
        )}
        {backupInfo?.totalSizeBytes && (
          <div>גודל: {(backupInfo.totalSizeBytes / 1024).toFixed(1)} KB</div>
        )}
        {backupInfo?.storeCounts && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#e0f2fe', borderRadius: '0.375rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>תוכן הגיבוי:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem' }}>
              <span>עסקאות: {backupInfo.storeCounts.transactions.toLocaleString('he-IL')}</span>
              <span>קבצים: {backupInfo.storeCounts.importedFiles.toLocaleString('he-IL')}</span>
              <span>קטגוריות: {backupInfo.storeCounts.categories.toLocaleString('he-IL')}</span>
              <span>מיפוי עסקים: {backupInfo.storeCounts.businessCategories.toLocaleString('he-IL')}</span>
              <span>משימות: {backupInfo.storeCounts.tasks.toLocaleString('he-IL')}</span>
              <span>הגדרות: {backupInfo.storeCounts.appSettings.toLocaleString('he-IL')}</span>
              <span>עסקים: {backupInfo.storeCounts.businesses.toLocaleString('he-IL')}</span>
              <span>פרויקטים: {backupInfo.storeCounts.projects.toLocaleString('he-IL')}</span>
              <span>משימות זמן: {backupInfo.storeCounts.harvestTasks.toLocaleString('he-IL')}</span>
              <span>רישומי זמן: {backupInfo.storeCounts.timeEntries.toLocaleString('he-IL')}</span>
            </div>
          </div>
        )}
        {backupInfo?.loading && <div style={{ color: '#2563eb' }}>טוען פרטי גיבוי...</div>}
        {backupInfo?.error && <div style={{ color: '#b91c1c' }}>שגיאה: {backupInfo.error}</div>}
      </div>
    </div>
  )
}
