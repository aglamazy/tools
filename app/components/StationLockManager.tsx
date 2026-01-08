'use client'

import { useEffect, useRef, useState } from 'react'
import { getStationId } from '@/app/stores/stationIdStore'
import { lockModeStore } from '@/app/stores/lockModeStore'
import {
  uploadStationLock,
  downloadStationLock,
  isLockStale,
  type StationLock,
} from '@/app/services/stationLockService'
import { fetchBackupFromDrive } from '@/app/services/driveSyncService'
import { importAllStores, type BackupData } from '@/app/services/backupService'
import { getDriveSyncSettings } from '@/app/services/appSettingsService'

type LockMode = 'initializing' | 'master' | 'slave'

const LOCK_TTL_SECONDS = 90 // 90 seconds (master updates every 30s, so 3 missed updates = stale)
const MASTER_UPDATE_INTERVAL_MS = 30_000 // 30 seconds
const SLAVE_POLL_INTERVAL_MS = 10_000 // 10 seconds

/**
 * Station Lock Manager
 * Coordinates multi-device sync by managing master/slave roles
 * - MASTER: Can edit, uploads backups, updates lock
 * - SLAVE: Frozen UI, polls for lock release
 */
export default function StationLockManager() {
  const [mode, setMode] = useState<LockMode>('initializing')
  const [lockFileId, setLockFileId] = useState<string | undefined>()
  const [currentLock, setCurrentLock] = useState<StationLock | null>(null)
  const [countdown, setCountdown] = useState<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef<boolean>(true)
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const stationId = getStationId()

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }

  const calculateCountdown = (lock: StationLock): number => {
    const lastActivity = new Date(lock.lastActivity).getTime()
    const expiresAt = lastActivity + lock.ttlSeconds * 1000
    const now = Date.now()
    const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000))
    console.log('[StationLock] Countdown calculation:', { lastActivity: lock.lastActivity, ttl: lock.ttlSeconds, remaining })
    return remaining
  }

  const startCountdownTimer = (lock: StationLock) => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
    }

    setCurrentLock(lock)
    const initial = calculateCountdown(lock)
    setCountdown(initial)
    console.log('[StationLock] Starting countdown timer, initial:', initial)

    // Update countdown every second
    countdownTimerRef.current = setInterval(() => {
      if (!isMountedRef.current) return
      const remaining = calculateCountdown(lock)
      setCountdown(remaining)
    }, 1000)
  }

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `${secs} שניות`
  }

  const createLock = (): StationLock => {
    const now = new Date().toISOString()
    return {
      stationId,
      acquiredAt: now,
      lastActivity: now,
      ttlSeconds: LOCK_TTL_SECONDS,
    }
  }

  const becomeMaster = async () => {
    if (!clientId || !stationId || !isMountedRef.current) return

    console.log('[StationLock] Becoming MASTER')
    setMode('master')
    lockModeStore.set('master')

    // Upload initial lock
    const lock = createLock()
    const result = await uploadStationLock({ clientId, lock, fileId: lockFileId })

    if (!result.success) {
      if (result.error === 'no-token') {
        console.log('[StationLock] No Drive token - lock system disabled. Connect Drive in Settings.')
        // Still set as master - app works normally but without multi-device sync
        return
      }
      console.error('[StationLock] Failed to upload lock:', result.error)
      return
    }

    if (result.fileId) {
      setLockFileId(result.fileId)
    }

    // Update lock every 30 seconds
    clearTimer()
    timerRef.current = setInterval(async () => {
      if (!isMountedRef.current) return
      const updatedLock = createLock() // Fresh timestamp
      const updateResult = await uploadStationLock({
        clientId,
        lock: updatedLock,
        fileId: lockFileId,
      })
      if (updateResult.success && updateResult.fileId && isMountedRef.current) {
        setLockFileId(updateResult.fileId)
      }
    }, MASTER_UPDATE_INTERVAL_MS)
  }

  const becomeSlave = async (existingLockFileId: string, initialLock?: StationLock) => {
    if (!clientId || !stationId || !isMountedRef.current) return

    console.log('[StationLock] Becoming SLAVE')
    setMode('slave')
    lockModeStore.set('slave')
    setLockFileId(existingLockFileId)

    // Start countdown with initial lock if provided
    if (initialLock) {
      startCountdownTimer(initialLock)
    }

    // Poll lock every 10 seconds
    clearTimer()
    timerRef.current = setInterval(async () => {
      if (!isMountedRef.current) return
      const result = await downloadStationLock({ clientId, fileId: existingLockFileId })
      if (!isMountedRef.current) return

      if (!result.success || !result.lock) {
        // Lock disappeared - become master
        console.log('[StationLock] Lock disappeared, becoming MASTER')
        await becomeMaster()
        return
      }

      // Update countdown with latest lock info
      startCountdownTimer(result.lock)

      if (isLockStale(result.lock)) {
        console.log('[StationLock] Lock is stale, transitioning to MASTER')

        // Download backup before becoming master
        const driveSyncSettings = await getDriveSyncSettings()
        if (!isMountedRef.current) return

        const backupResult = await fetchBackupFromDrive({
          clientId,
          fileId: driveSyncSettings.driveFileId,
          fileName: 'finance-backup.json',
        })
        if (!isMountedRef.current) return

        if (backupResult.success && backupResult.data) {
          console.log('[StationLock] Importing backup from Drive')
          await importAllStores(backupResult.data as BackupData)
        } else {
          console.warn('[StationLock] Failed to download backup, proceeding anyway:', backupResult.error)
        }

        // Become master
        await becomeMaster()
      }
    }, SLAVE_POLL_INTERVAL_MS)
  }

  const initializeLockState = async () => {
    if (!clientId || !stationId) {
      console.log('[StationLock] No clientId or stationId, staying in initializing')
      return
    }

    // Check if user chose standalone mode
    const settings = await getDriveSyncSettings()
    if (!isMountedRef.current) return

    if (settings.standaloneMode === true) {
      console.log('[StationLock] Standalone mode - no multi-device sync')
      setMode('master')
      lockModeStore.set('master')
      return
    }

    console.log('[StationLock] Initializing...', { stationId })

    // Try to download existing lock
    const result = await downloadStationLock({ clientId })
    if (!isMountedRef.current) return

    if (!result.success) {
      if (result.error === 'no-token') {
        // No Drive connection - work in offline mode as master
        console.log('[StationLock] No Drive token - working in offline mode (no multi-device sync)')
        setMode('master')
        lockModeStore.set('master')
        return
      }

      if (result.error === 'no-file') {
        // No lock file exists - become master
        console.log('[StationLock] No lock file found, becoming MASTER')
        await becomeMaster()
        return
      }

      // Other error
      console.error('[StationLock] Failed to check lock:', result.error)
      // Default to master mode so app is usable
      setMode('master')
      lockModeStore.set('master')
      return
    }

    const { lock, fileId } = result

    if (lock && lock.stationId === stationId) {
      // This is my lock - become master
      console.log('[StationLock] Found my own lock, becoming MASTER')
      setLockFileId(fileId)
      await becomeMaster()
      return
    }

    // Lock belongs to another station
    // Even if stale, start as slave (as per design)
    console.log('[StationLock] Lock belongs to another station, becoming SLAVE')
    await becomeSlave(fileId!, lock!)
  }

  useEffect(() => {
    if (!clientId || !stationId) return

    isMountedRef.current = true
    initializeLockState()

    return () => {
      isMountedRef.current = false
      clearTimer()
    }
  }, [clientId, stationId])

  // Render frozen UI modal if in slave mode
  if (mode === 'slave') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          dir="rtl"
          style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '1rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            maxWidth: '400px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem' }}>העריכה מושבתת</h2>
          <p style={{ color: '#64748b', margin: 0, lineHeight: 1.6 }}>
            התוכנה פעילה בתחנה אחרת.
            <br />
            כאשר התחנה האחרת תשוחרר, העריכה תתאפשר כאן אוטומטית.
          </p>

          <div
            style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#fef3c7',
              borderRadius: '0.5rem',
              border: '2px solid #fbbf24',
            }}
          >
            <div style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.5rem' }}>
              זמן משוער עד שחרור:
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#92400e' }}>
              {countdown > 0 ? formatCountdown(countdown) : '...מחשב'}
            </div>
          </div>

          <div
            style={{
              marginTop: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              color: '#3b82f6',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                background: '#3b82f6',
                borderRadius: '50%',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
            <span style={{ fontSize: '0.875rem' }}>בודק זמינות...</span>
          </div>
        </div>
        <style jsx>{`
          @keyframes pulse {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}</style>
      </div>
    )
  }

  // Master and initializing modes don't render anything
  return null
}
