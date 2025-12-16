'use client'

import React, { useState, useEffect } from 'react'
import {
  getDriveSyncSettings,
  setDriveSyncSettings,
  type DriveSyncSettings,
} from '@/app/services/appSettingsService'
import { exportAllStores, importAllStores, type BackupData } from '@/app/services/backupService'
import {
  exportBackupToDrive,
  interactiveConnectAndExport,
  clearDriveAuth,
  fetchBackupFromDrive,
  getDriveBackupMetadata,
} from '@/app/services/driveSyncService'
import { config } from '@/app/config'
import YesNoModal from '../YesNoModal'
import Modal from '../Modal'

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
  }
  totalSizeBytes?: number
  backupVersion?: string
  backupTimestamp?: string
}

export default function SyncTab() {
  const [driveSyncSettings, setDriveSyncSettingsState] = useState<DriveSyncSettings | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'saving' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [driveBackupInfo, setDriveBackupInfo] = useState<DriveBackupInfo | null>(null)
  const [importConfirm, setImportConfirm] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null })
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' })

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
  const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('he-IL') : '—')

  useEffect(() => {
    loadDriveSyncSettings()
  }, [])

  const loadDriveSyncSettings = async () => {
    try {
      const settings = await getDriveSyncSettings()
      setDriveSyncSettingsState(settings)
    } catch (err) {
      console.error('Error loading Drive sync settings:', err)
    }
  }

  const persistDriveSyncSettingsSafe = async (settings: DriveSyncSettings) => {
    try {
      setDriveSyncSettingsState(settings)
      await setDriveSyncSettings(settings)
    } catch (err) {
      console.error('Error saving Drive sync settings:', err)
      setAlertModal({ isOpen: true, message: 'שגיאה בשמירת הגדרות הסנכרון' })
    }
  }

  const handleDriveFrequencyChange = async (value: number) => {
    if (!driveSyncSettings) return
    const minMinutes = config.syncIntervalSeconds / 60
    await persistDriveSyncSettingsSafe({
      ...driveSyncSettings,
      frequencyMinutes: minMinutes,
    })
  }

  const handleToggleAutoSync = async () => {
    if (!driveSyncSettings) return
    await persistDriveSyncSettingsSafe({
      ...driveSyncSettings,
      autoSyncEnabled: !driveSyncSettings.autoSyncEnabled,
    })
  }

  const handleConnectDrive = async () => {
    if (!googleClientId) {
      setAlertModal({ isOpen: true, message: 'חסר GOOGLE CLIENT ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)' })
      return
    }
    if (!driveSyncSettings) return

    setSyncStatus('connecting')
    setSyncMessage('')
    try {
      const result = await interactiveConnectAndExport({
        clientId: googleClientId,
        existingFileId: driveSyncSettings.driveFileId,
        useAppData: true,
        fileName: 'finance-backup.json',
      })

      if (result.success) {
        const updated: DriveSyncSettings = {
          ...driveSyncSettings,
          driveFileId: result.fileId || driveSyncSettings.driveFileId,
          lastSyncAt: new Date().toISOString(),
          remoteModifiedAt: new Date().toISOString(),
          lastSyncError: undefined,
        }
        await persistDriveSyncSettingsSafe(updated)
        setAlertModal({ isOpen: true, message: 'החיבור ל-Google Drive הצליח והגיבוי נשמר!' })
      } else {
        const msg = result.error === 'empty-backup'
          ? 'הגיבוי ריק (אין עסקאות/קבצים). שמירה בוטלה.'
          : 'חיבור ל-Google Drive נכשל. נסה שוב.'
        setSyncStatus('error')
        setSyncMessage(result.error || 'שגיאה לא ידועה')
        setAlertModal({ isOpen: true, message: msg })
      }
    } catch (err: any) {
      console.error('Drive connect failed:', err)
      setSyncStatus('error')
      setSyncMessage(err?.message || 'שגיאה לא ידועה')
      setAlertModal({ isOpen: true, message: 'חיבור ל-Google Drive נכשל. בדוק הרשאות ונסה שוב.' })
    } finally {
      setSyncStatus('idle')
    }
  }

  const handleManualDriveSync = async () => {
    if (!googleClientId) {
      setAlertModal({ isOpen: true, message: 'חסר GOOGLE CLIENT ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)' })
      return
    }
    if (!driveSyncSettings) return

    setSyncStatus('saving')
    setSyncMessage('')

    const meta = await getDriveBackupMetadata({ clientId: googleClientId, fileId: driveSyncSettings.driveFileId, fileName: 'finance-backup.json' })
    if (meta.success && meta.fileId && meta.modifiedTime) {
      const remoteNewer = !driveSyncSettings.lastSyncAt || new Date(meta.modifiedTime) > new Date(driveSyncSettings.lastSyncAt)
      if (remoteNewer) {
        const pull = await fetchBackupFromDrive({ clientId: googleClientId, fileId: meta.fileId, fileName: 'finance-backup.json' })
        if (pull.success && pull.data) {
          await importAllStores(pull.data as BackupData)
          await persistDriveSyncSettingsSafe({
            ...driveSyncSettings,
            driveFileId: meta.fileId,
            lastSyncAt: new Date().toISOString(),
            remoteModifiedAt: meta.modifiedTime,
            lastSyncError: undefined,
          })
        } else if (pull.error === 'no-token') {
          setAlertModal({ isOpen: true, message: 'נדרש חיבור ל-Google Drive. לחץ על התחברות.' })
          setSyncStatus('idle')
          return
        } else {
          setSyncStatus('error')
          setSyncMessage(pull.error || '')
          setAlertModal({ isOpen: true, message: 'שגיאה בהורדת הגיבוי לפני שמירה.' })
          setSyncStatus('idle')
          return
        }
      }
    }

    const result = await exportBackupToDrive({
      clientId: googleClientId,
      fileId: driveSyncSettings.driveFileId,
      useAppData: true,
      fileName: 'finance-backup.json',
    })

    if (result.success) {
      const updated: DriveSyncSettings = {
        ...driveSyncSettings,
        driveFileId: result.fileId || driveSyncSettings.driveFileId,
        lastSyncAt: new Date().toISOString(),
        remoteModifiedAt: new Date().toISOString(),
        lastSyncError: undefined,
      }
      await persistDriveSyncSettingsSafe(updated)
      setAlertModal({ isOpen: true, message: 'הגיבוי נשמר ל-Google Drive בהצלחה!' })
    } else {
      const msg = result.error === 'no-token'
        ? 'נדרש חיבור ל-Google Drive. לחץ על התחברות.'
        : result.error === 'empty-backup'
          ? 'הגיבוי ריק (אין עסקאות/קבצים). שמירה בוטלה.'
          : 'שגיאה בשמירת הגיבוי ל-Drive.'
      setSyncStatus('error')
      setSyncMessage(result.error || 'unknown-error')
      setAlertModal({ isOpen: true, message: msg })
    }

    setSyncStatus('idle')
  }

  const handleRestoreFromDrive = async () => {
    if (!googleClientId) {
      setAlertModal({ isOpen: true, message: 'חסר GOOGLE CLIENT ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)' })
      return
    }
    if (!driveSyncSettings) {
      setAlertModal({ isOpen: true, message: 'חסר חיבור ל-Drive או הגדרות סנכרון.' })
      return
    }

    setSyncStatus('saving')
    setSyncMessage('')
    const result = await fetchBackupFromDrive({
      clientId: googleClientId,
      fileId: driveSyncSettings?.driveFileId,
      fileName: 'finance-backup.json',
    })

    const storeCounts = result.data?.stores
      ? {
          transactions: result.data.stores.transactions?.length ?? 0,
          importedFiles: result.data.stores.importedFiles?.length ?? 0,
          categories: result.data.stores.categories?.length ?? 0,
          businessCategories: result.data.stores.businessCategories?.length ?? 0,
          tasks: result.data.stores.tasks?.length ?? 0,
          appSettings: result.data.stores.appSettings?.length ?? 0,
        }
      : null

    const totalIndexedRecords = storeCounts == null
      ? 0
      : Object.values(storeCounts).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)
    const hasStoreSnapshots = Boolean(result.data?.stores?.subjectStore) || Boolean(result.data?.stores?.historyStore)

    if (result.success && result.data) {
      try {
        if (totalIndexedRecords === 0 && !hasStoreSnapshots) {
          setSyncStatus('error')
          setSyncMessage('empty-backup')
          setAlertModal({ isOpen: true, message: 'הגיבוי מ-Drive ריק או פגום. שחזור בוטל.' })
          setSyncStatus('idle')
          return
        }
        if ((storeCounts?.transactions ?? 0) === 0 || (storeCounts?.importedFiles ?? 0) === 0) {
          setSyncStatus('error')
          setSyncMessage('missing-core-data')
          setAlertModal({ isOpen: true, message: 'קובץ הגיבוי חסר עסקאות או קבצים מיובאים. שחזור בוטל.' })
          setSyncStatus('idle')
          return
        }
        await importAllStores(result.data as BackupData)
        await persistDriveSyncSettingsSafe({
          ...driveSyncSettings,
          driveFileId: result.fileId || driveSyncSettings?.driveFileId,
          lastSyncAt: new Date().toISOString(),
          remoteModifiedAt: new Date().toISOString(),
          lastSyncError: undefined,
        })
        setAlertModal({ isOpen: true, message: 'שוחזר בהצלחה מ-Google Drive!' })
      } catch (err) {
        console.error('Error importing backup from Drive:', err)
        setAlertModal({ isOpen: true, message: 'שגיאה בייבוא הגיבוי מה-Drive.' })
      }
    } else {
      const msg = result.error === 'no-token'
        ? 'נדרש חיבור ל-Google Drive (התחברות + שמירה) לפני שחזור.'
        : result.error === 'no-file'
          ? 'לא נמצא קובץ גיבוי ב-Drive. בצע שמירה פעם אחת ואז נסה שוב.'
          : 'שגיאה בטעינת הגיבוי מה-Drive.'
      setSyncStatus('error')
      setSyncMessage(result.error || 'unknown-error')
      setAlertModal({ isOpen: true, message: msg })
    }

    setSyncStatus('idle')
  }

  const handleDisconnectDrive = async () => {
    if (!driveSyncSettings) return
    clearDriveAuth()
    const updated: DriveSyncSettings = {
      ...driveSyncSettings,
      autoSyncEnabled: false,
      driveFileId: driveSyncSettings.driveFileId,
    }
    await persistDriveSyncSettingsSafe(updated)
    setAlertModal({ isOpen: true, message: 'החיבור נותק. תידרש התחברות מחדש לגיבוי.' })
  }

  const handleCheckDriveBackupInfo = async () => {
    if (!googleClientId) {
      setAlertModal({ isOpen: true, message: 'חסר GOOGLE CLIENT ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID)' })
      return
    }
    if (!driveSyncSettings) {
      setAlertModal({ isOpen: true, message: 'חסר חיבור ל-Drive או הגדרות סנכרון.' })
      return
    }
    setDriveBackupInfo((prev) => ({ ...prev, loading: true, error: undefined }))
    try {
      const meta = await getDriveBackupMetadata({
        clientId: googleClientId,
        fileId: driveSyncSettings.driveFileId,
        fileName: 'finance-backup.json',
      })
      if (meta.success && meta.fileId) {
        const backupResult = await fetchBackupFromDrive({
          clientId: googleClientId,
          fileId: meta.fileId,
          fileName: 'finance-backup.json',
        })

        if (backupResult.success && backupResult.data) {
          const backup = backupResult.data as BackupData
          const storeCounts = {
            transactions: backup.stores?.transactions?.length ?? 0,
            importedFiles: backup.stores?.importedFiles?.length ?? 0,
            categories: backup.stores?.categories?.length ?? 0,
            businessCategories: backup.stores?.businessCategories?.length ?? 0,
            tasks: backup.stores?.tasks?.length ?? 0,
            appSettings: backup.stores?.appSettings?.length ?? 0,
          }
          setDriveBackupInfo({
            fileId: meta.fileId,
            modifiedTime: meta.modifiedTime,
            fetchedAt: new Date().toISOString(),
            loading: false,
            storeCounts,
            totalSizeBytes: JSON.stringify(backup).length,
            backupVersion: backup.version,
            backupTimestamp: backup.timestamp,
          })
        } else {
          setDriveBackupInfo({
            fileId: meta.fileId,
            modifiedTime: meta.modifiedTime,
            fetchedAt: new Date().toISOString(),
            loading: false,
            error: backupResult.error || 'failed-to-fetch-content',
          })
        }
      } else {
        setDriveBackupInfo({
          error: meta.error || 'unknown-error',
          fetchedAt: new Date().toISOString(),
          loading: false,
        })
        setAlertModal({ isOpen: true, message: 'שגיאה באחזור פרטי הגיבוי מ-Drive.' })
      }
    } catch (err: any) {
      console.error('Error checking Drive backup metadata:', err)
      setDriveBackupInfo({
        error: err?.message || 'unknown-error',
        fetchedAt: new Date().toISOString(),
        loading: false,
      })
      setAlertModal({ isOpen: true, message: 'שגיאה באחזור פרטי הגיבוי מ-Drive.' })
    }
  }

  const handleExportAllData = async () => {
    try {
      const backup = await exportAllStores()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      setAlertModal({ isOpen: true, message: 'הנתונים יוצאו בהצלחה!' })
    } catch (err) {
      console.error('Error exporting all data:', err)
      setAlertModal({ isOpen: true, message: 'שגיאה בייצוא הנתונים' })
    }
  }

  const handleImportAllData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImportConfirm({ isOpen: true, file })
    event.target.value = ''
  }

  const confirmImport = () => {
    if (!importConfirm.file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const backup = JSON.parse(content) as BackupData

        if (!backup.version || !backup.stores) {
          setAlertModal({ isOpen: true, message: 'פורמט קובץ לא תקין' })
          return
        }

        const storeCounts = {
          transactions: backup.stores.transactions?.length ?? 0,
          importedFiles: backup.stores.importedFiles?.length ?? 0,
          categories: backup.stores.categories?.length ?? 0,
          businessCategories: backup.stores.businessCategories?.length ?? 0,
          tasks: backup.stores.tasks?.length ?? 0,
          appSettings: backup.stores.appSettings?.length ?? 0,
        }
        console.log('[BackupRestore] local import candidate', storeCounts)

        if (storeCounts.transactions === 0 || storeCounts.importedFiles === 0) {
          setAlertModal({ isOpen: true, message: 'קובץ הגיבוי חסר עסקאות או קבצים מיובאים. שחזור בוטל.' })
          return
        }

        await importAllStores(backup)
        setImportConfirm({ isOpen: false, file: null })
        setAlertModal({ isOpen: true, message: 'הנתונים יובאו בהצלחה! הדף יטען מחדש.' })
        setTimeout(() => window.location.reload(), 1500)
      } catch (err) {
        console.error('Error importing all data:', err)
        setAlertModal({ isOpen: true, message: 'שגיאה בקריאת הקובץ' })
      }
    }
    reader.readAsText(importConfirm.file)
  }

  return (
    <>
      {/* Drive Sync Section */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#ecfdf3' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Google Drive סנכרון ל-</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#166534', fontSize: '0.95rem' }}>
              גיבוי שקט לתיקיית appData בחשבון Google Drive שלך. הנתונים לא יוצאים מהדפדפן חוץ מהעברה המאובטחת ל-Drive.
            </p>
            {!googleClientId && (
              <p style={{ margin: '0.35rem 0 0', color: '#b91c1c', fontSize: '0.9rem' }}>
                חסר NEXT_PUBLIC_GOOGLE_CLIENT_ID בקובץ הסביבה. הוסף Client ID כדי להתחבר.
              </p>
            )}
            {driveSyncSettings?.lastSyncAt && (
              <p style={{ margin: '0.35rem 0 0', color: '#065f46', fontSize: '0.9rem' }}>
                סנכרון אחרון: {new Date(driveSyncSettings.lastSyncAt).toLocaleString('he-IL')}
              </p>
            )}
            {driveSyncSettings?.lastSyncError && (
              <p style={{ margin: '0.35rem 0 0', color: '#b91c1c', fontSize: '0.9rem' }}>
                שגיאה אחרונה: {driveSyncSettings.lastSyncError}
              </p>
            )}
            {syncMessage && (
              <p style={{ margin: '0.35rem 0 0', color: '#b91c1c', fontSize: '0.9rem' }}>
                {syncMessage}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
            <button onClick={handleConnectDrive} className="file-picker" style={{ background: '#0ea5e9', color: 'white' }} disabled={syncStatus !== 'idle'}>
              התחברות + שמירה
            </button>
            <button onClick={handleManualDriveSync} className="file-picker" style={{ background: '#10b981', color: 'white' }} disabled={syncStatus !== 'idle'}>
              שמור עכשיו
            </button>
            <button onClick={handleRestoreFromDrive} className="file-picker" style={{ background: '#f97316', color: 'white' }} disabled={syncStatus !== 'idle'}>
              שחזר מגיבוי
            </button>
            <button onClick={handleDisconnectDrive} className="file-picker secondary" style={{ background: '#e5e7eb', color: '#111827' }}>
              נתק חיבור
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
            <input type="checkbox" checked={driveSyncSettings?.autoSyncEnabled ?? false} onChange={handleToggleAutoSync} />
            הפעל סנכרון אוטומטי (ברירת מחדל {config.syncIntervalSeconds / 60} דק')
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.95rem' }}>תדירות (דקות):</span>
            <input
              type="number"
              min={config.syncIntervalSeconds / 60}
              value={driveSyncSettings?.frequencyMinutes ?? config.syncIntervalSeconds / 60}
              onChange={(e) => handleDriveFrequencyChange(Number(e.target.value))}
              style={{ width: '90px', padding: '0.35rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', direction: 'ltr' }}
            />
          </div>
          {syncStatus !== 'idle' && (
            <span style={{ fontSize: '0.9rem', color: '#2563eb' }}>
              מצב: {syncStatus === 'connecting' ? 'מתחבר...' : syncStatus === 'saving' ? 'שומר...' : 'שגיאה'}
            </span>
          )}
        </div>

        {/* Drive Backup Info */}
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.95rem', color: '#0f172a' }}>מידע על קובץ הגיבוי ב-Drive</div>
            <button onClick={handleCheckDriveBackupInfo} className="file-picker secondary" style={{ flexShrink: 0 }} disabled={syncStatus !== 'idle'}>
              בדוק קובץ ב-Drive
            </button>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#111827' }}>
            <div>מזהה קובץ: {driveBackupInfo?.fileId || driveSyncSettings?.driveFileId || '—'}</div>
            <div>עודכן ב-Drive: {formatTime(driveBackupInfo?.modifiedTime || driveSyncSettings?.remoteModifiedAt)}</div>
            <div>בדיקה אחרונה: {formatTime(driveBackupInfo?.fetchedAt)}</div>
            {driveBackupInfo?.backupVersion && (
              <div>גרסת גיבוי: {driveBackupInfo.backupVersion} | נוצר: {formatTime(driveBackupInfo.backupTimestamp)}</div>
            )}
            {driveBackupInfo?.totalSizeBytes && (
              <div>גודל: {(driveBackupInfo.totalSizeBytes / 1024).toFixed(1)} KB</div>
            )}
            {driveBackupInfo?.storeCounts && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#e0f2fe', borderRadius: '0.375rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>תוכן הגיבוי:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem' }}>
                  <span>עסקאות: {driveBackupInfo.storeCounts.transactions.toLocaleString('he-IL')}</span>
                  <span>קבצים: {driveBackupInfo.storeCounts.importedFiles.toLocaleString('he-IL')}</span>
                  <span>קטגוריות: {driveBackupInfo.storeCounts.categories.toLocaleString('he-IL')}</span>
                  <span>מיפוי עסקים: {driveBackupInfo.storeCounts.businessCategories.toLocaleString('he-IL')}</span>
                  <span>משימות: {driveBackupInfo.storeCounts.tasks.toLocaleString('he-IL')}</span>
                  <span>הגדרות: {driveBackupInfo.storeCounts.appSettings.toLocaleString('he-IL')}</span>
                </div>
              </div>
            )}
            {driveBackupInfo?.loading && <div style={{ color: '#2563eb' }}>טוען פרטי גיבוי...</div>}
            {driveBackupInfo?.error && <div style={{ color: '#b91c1c' }}>שגיאה: {driveBackupInfo.error}</div>}
          </div>
        </div>
      </section>

      {/* Local Backup Section */}
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#fef3c7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>גיבוי ושחזור נתונים</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#92400e', fontSize: '0.95rem' }}>
              ייצוא כל הנתונים לקובץ גיבוי או ייבוא מגיבוי קיים. הנתונים נשארים רק במכשיר שלך.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button onClick={handleExportAllData} className="file-picker" style={{ background: '#10b981', color: 'white' }}>
              ייצא הכל
            </button>
            <label className="upload-another-btn" style={{ cursor: 'pointer', background: '#3b82f6', color: 'white' }}>
              ייבא הכל
              <input type="file" accept=".json" onChange={handleImportAllData} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </section>

      <YesNoModal
        isOpen={importConfirm.isOpen}
        question="ייבוא נתונים ימחק את כל הנתונים הקיימים. האם להמשיך?"
        onYes={confirmImport}
        onNo={() => setImportConfirm({ isOpen: false, file: null })}
      />

      <Modal isOpen={alertModal.isOpen} onClose={() => setAlertModal({ isOpen: false, message: '' })} maxWidth="400px">
        <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: '1.125rem', margin: '0 0 1.5rem 0' }}>{alertModal.message}</p>
          <button onClick={() => setAlertModal({ isOpen: false, message: '' })} className="file-picker" autoFocus>
            אישור
          </button>
        </div>
      </Modal>
    </>
  )
}
