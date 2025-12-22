'use client'

import { useEffect, useRef, useState } from 'react'
import { getDriveSyncSettings, setDriveSyncSettings, type DriveSyncSettings } from '@/app/services/appSettingsService'
import { exportBackupToDrive } from '@/app/services/driveSyncService'
import { lockModeStore } from '@/app/stores/lockModeStore'

// Background manager that periodically syncs data to Google Drive appData
// Only runs when station is in MASTER mode
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
    // In standalone mode, don't auto-sync
    if (driveSettings.standaloneMode === true) return

    const intervalMs = driveSettings.frequencyMinutes * 60 * 1000

    // Run once immediately
    triggerSync(driveSettings)

    timerRef.current = setInterval(() => triggerSync(driveSettings), intervalMs)
  }

  const triggerSync = async (driveSettings: DriveSyncSettings) => {
    // Only sync if we're MASTER - slaves never upload
    if (!lockModeStore.isMaster()) {
      console.log('[DriveSync] Skipping sync - not master')
      return
    }

    if (syncingRef.current) return
    if (!clientId) return
    syncingRef.current = true

    try {
      // Master mode: only upload, never download
      const result = await exportBackupToDrive({
        clientId,
        fileId: driveSettings.driveFileId,
        useAppData: true,
        fileName: 'finance-backup.json',
      })

      if (result.success) {
        const now = new Date().toISOString()
        const updated: DriveSyncSettings = {
          ...driveSettings,
          driveFileId: result.fileId || driveSettings.driveFileId,
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
          ...driveSettings,
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
