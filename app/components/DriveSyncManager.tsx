'use client'

import { useEffect, useRef, useState } from 'react'
import { getDriveSyncSettings, setDriveSyncSettings, type DriveSyncSettings } from '@/app/services/appSettingsService'
import { config } from '@/app/config'
import { exportBackupToDrive, fetchBackupFromDrive, getDriveBackupMetadata } from '@/app/services/driveSyncService'
import { importAllStores, type BackupData } from '@/app/services/backupService'

// Background manager that periodically syncs data to Google Drive appData
export default function DriveSyncManager() {
  const [settings, setSettings] = useState<DriveSyncSettings | null>(null)
  const syncingRef = useRef(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  const loadSettings = async () => {
    try {
      const nextSettings = await getDriveSyncSettings()
      setSettings(nextSettings)
      configureTimer(nextSettings)
    } catch (err) {
      console.error('Error loading Drive sync settings (manager):', err)
    }
  }

  const configureTimer = (driveSettings: DriveSyncSettings) => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (!clientId) return
    if (!driveSettings.autoSyncEnabled) return

    const minMinutes = config.syncIntervalSeconds / 60
    const intervalMs = minMinutes * 60 * 1000

    // Run once immediately
    triggerSync(driveSettings)

    timerRef.current = setInterval(() => triggerSync(driveSettings), intervalMs)
  }

  const triggerSync = async (driveSettings: DriveSyncSettings) => {
    if (syncingRef.current) return
    if (!clientId) return
    syncingRef.current = true

    try {
      // Step 1: check remote metadata and pull if newer
      const meta = await getDriveBackupMetadata({ clientId, fileId: driveSettings.driveFileId, fileName: 'finance-backup.json' })
      let workingSettings = { ...driveSettings }

      if (meta.success && meta.fileId && meta.modifiedTime) {
        const remoteNewer = !driveSettings.lastSyncAt || new Date(meta.modifiedTime) > new Date(driveSettings.lastSyncAt)
        if (remoteNewer) {
          const pull = await fetchBackupFromDrive({ clientId, fileId: meta.fileId, fileName: 'finance-backup.json' })
          if (pull.success && pull.data) {
            await importAllStores(pull.data as BackupData)
            workingSettings = {
              ...workingSettings,
              driveFileId: meta.fileId,
              lastSyncAt: new Date().toISOString(),
              remoteModifiedAt: meta.modifiedTime,
              lastSyncError: undefined,
            }
          } else if (pull.error === 'no-token') {
            console.log('Drive pull skipped: no token')
          } else {
            workingSettings = { ...workingSettings, lastSyncError: pull.error }
            console.error('Drive pull failed:', pull.error)
          }
        } else {
          workingSettings = { ...workingSettings, remoteModifiedAt: meta.modifiedTime }
        }
      }

      // Step 2: push current state to Drive
      const result = await exportBackupToDrive({
        clientId,
        fileId: workingSettings.driveFileId,
        useAppData: true,
        fileName: 'finance-backup.json',
      })

      if (result.success) {
        const now = new Date().toISOString()
        const updated: DriveSyncSettings = {
          ...workingSettings,
          driveFileId: result.fileId || workingSettings.driveFileId,
          lastSyncAt: now,
          remoteModifiedAt: now,
          lastSyncError: undefined,
        }
        setSettings(updated)
        await setDriveSyncSettings(updated)
      } else if (result.error === 'no-token') {
        console.log('Drive sync skipped: no token (user not connected)')
      } else {
        const updated: DriveSyncSettings = {
          ...workingSettings,
          lastSyncError: result.error,
        }
        setSettings(updated)
        await setDriveSyncSettings(updated)
        console.error('Drive sync failed:', result.error)
      }
    } catch (err) {
      console.error('Drive sync exception:', err)
    } finally {
      syncingRef.current = false
    }
  }

  useEffect(() => {
    if (!clientId) return
    loadSettings()

    const settingsRefresh = setInterval(loadSettings, 60 * 1000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && settings) {
        triggerSync(settings)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      clearInterval(settingsRefresh)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [clientId, settings])

  return null
}
