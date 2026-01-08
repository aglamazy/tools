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
  getDriveBackupMetadata,
  fetchBackupFromDrive,
} from '@/app/services/driveSyncService'
import { lockModeStore } from '@/app/stores/lockModeStore'
import YesNoModal from '../YesNoModal'
import Modal from '../Modal'
import DriveSyncSection from './sync/DriveSyncSection'
import LocalBackup from './sync/LocalBackup'

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

export default function SyncTab() {
  const [driveSyncSettings, setDriveSyncSettingsState] = useState<DriveSyncSettings | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'saving' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  const [driveBackupInfo, setDriveBackupInfo] = useState<DriveBackupInfo | null>(null)
  const [importConfirm, setImportConfirm] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null })
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' })
  const [lockMode, setLockMode] = useState<'initializing' | 'master' | 'slave'>('initializing')

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

  useEffect(() => {
    loadDriveSyncSettings()

    // Subscribe to lock mode changes
    setLockMode(lockModeStore.get())
    const unsubscribe = lockModeStore.subscribe((mode) => {
      setLockMode(mode)
    })

    return unsubscribe
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
    // Ensure frequency is at least 5 minutes
    const safeValue = Math.max(value, 5)
    await persistDriveSyncSettingsSafe({
      ...driveSyncSettings,
      frequencyMinutes: safeValue,
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
        let msg = 'חיבור ל-Google Drive נכשל. נסה שוב.'
        if (result.error === 'empty-backup') {
          msg = 'הגיבוי ריק (אין עסקאות/קבצים). שמירה בוטלה.'
        } else if (result.error?.includes('popup')) {
          msg = 'הדפדפן חסם את חלון ההתחברות. אנא אפשר חלונות קופצים (popups) עבור אתר זה ונסה שוב.'
        }
        setSyncStatus('error')
        setSyncMessage(result.error || 'שגיאה לא ידועה')
        setAlertModal({ isOpen: true, message: msg })
      }
    } catch (err: any) {
      console.error('Drive connect failed:', err)
      setSyncStatus('error')
      setSyncMessage(err?.message || 'שגיאה לא ידועה')
      const msg = err?.message?.includes('popup')
        ? 'הדפדפן חסם את חלון ההתחברות. אנא אפשר חלונות קופצים (popups) עבור אתר זה ונסה שוב.'
        : 'חיבור ל-Google Drive נכשל. בדוק הרשאות ונסה שוב.'
      setAlertModal({ isOpen: true, message: msg })
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
            businesses: backup.stores?.businesses?.length ?? 0,
            projects: backup.stores?.projects?.length ?? 0,
            harvestTasks: backup.stores?.harvestTasks?.length ?? 0,
            timeEntries: backup.stores?.timeEntries?.length ?? 0,
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
          businesses: backup.stores.businesses?.length ?? 0,
          projects: backup.stores.projects?.length ?? 0,
          harvestTasks: backup.stores.harvestTasks?.length ?? 0,
          timeEntries: backup.stores.timeEntries?.length ?? 0,
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

  const handleToggleStandaloneMode = async () => {
    if (!driveSyncSettings) return

    const newMode = !driveSyncSettings.standaloneMode

    await persistDriveSyncSettingsSafe({
      ...driveSyncSettings,
      standaloneMode: newMode,
    })

    setAlertModal({
      isOpen: true,
      message: newMode
        ? 'עבר למצב עצמאי. טוען מחדש...'
        : 'עבר למצב סנכרון מרובה מכשירים. טוען מחדש...'
    })
    setTimeout(() => window.location.reload(), 1500)
  }

  if (!driveSyncSettings) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>טוען...</div>
  }

  return (
    <>
      <DriveSyncSection
        googleClientId={googleClientId}
        driveSyncSettings={driveSyncSettings}
        syncStatus={syncStatus}
        syncMessage={syncMessage}
        driveBackupInfo={driveBackupInfo}
        lockMode={lockMode}
        onConnect={handleConnectDrive}
        onManualSync={handleManualDriveSync}
        onToggleStandaloneMode={handleToggleStandaloneMode}
        onFrequencyChange={handleDriveFrequencyChange}
        onCheckBackupInfo={handleCheckDriveBackupInfo}
      />

      <LocalBackup onExport={handleExportAllData} onImport={handleImportAllData} />

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
