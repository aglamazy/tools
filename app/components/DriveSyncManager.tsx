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
  const settingsRefreshRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef<boolean>(true)
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  const loadSettings = async (runImmediately = false) => {
    if (!isMountedRef.current) return
    try {
      const nextSettings = await getDriveSyncSettings()
      if (!isMountedRef.current) return
      setSettings(nextSettings)
      configureTimer(nextSettings, runImmediately)
    } catch (err) {
      console.error('Error loading Drive sync settings (manager):', err)
    }
  }

  const configureTimer = (driveSettings: DriveSyncSettings, runImmediately = false) => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (!clientId) return
    // In standalone mode, don't auto-sync
    if (driveSettings.standaloneMode === true) return

    const intervalMs = driveSettings.frequencyMinutes * 60 * 1000

    // Run once immediately only on first load
    if (runImmediately) {
      triggerSync(driveSettings)
    }

    timerRef.current = setInterval(() => triggerSync(driveSettings), intervalMs)
  }

  const triggerSync = async (driveSettings: DriveSyncSettings) => {
    if (!isMountedRef.current) return

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
        if (!isMountedRef.current) return
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
        if (!isMountedRef.current) return
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

    isMountedRef.current = true

    // Load settings once on mount, trigger immediate sync
    loadSettings(true)

    // Refresh settings every 60 seconds (without triggering immediate sync)
    settingsRefreshRef.current = setInterval(() => loadSettings(false), 60 * 1000)

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        // Reload settings and trigger sync when tab becomes visible
        const currentSettings = await getDriveSyncSettings()
        if (isMountedRef.current) {
          triggerSync(currentSettings)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isMountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      if (settingsRefreshRef.current) clearInterval(settingsRefreshRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [clientId])

  return null
}
