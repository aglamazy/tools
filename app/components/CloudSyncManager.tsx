'use client'

import { useEffect, useRef, useState } from 'react'
import { subscribeToAuth } from '@/app/stores/authStore'
import {
  isCloudBackupAvailable,
  hasEncryptionPasswordSetup,
  syncMerge,
  verifyEncryptionPassword,
  restoreFromCloud,
  getBackupInfo,
} from '@/app/services/cloudBackupService'
import { isLocalDataEmpty } from '@/app/services/backupService'
import { config } from '@/app/config'
import EncryptionPasswordModal from './EncryptionPasswordModal'

// Session storage - cleared on tab close, simple and reliable
const SYNC_PASSWORD_KEY = 'cloud_sync_pwd'

/**
 * Get stored encryption password
 */
export function getSyncPassword(): string | null {
  try {
    return sessionStorage.getItem(SYNC_PASSWORD_KEY)
  } catch {
    return null
  }
}

/**
 * Store encryption password for auto-sync (session only)
 */
export function setSyncPassword(password: string): void {
  try {
    sessionStorage.setItem(SYNC_PASSWORD_KEY, password)
  } catch {
    // Ignore
  }
}

/**
 * Clear stored encryption password
 */
export function clearSyncPassword(): void {
  try {
    sessionStorage.removeItem(SYNC_PASSWORD_KEY)
  } catch {
    // Ignore
  }
}

/**
 * CloudSyncManager
 * Handles automatic periodic backup to cloud storage
 */
export default function CloudSyncManager() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isSyncingRef = useRef(false)
  const promptedRef = useRef(false)
  const initialCheckDoneRef = useRef(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordMode, setPasswordMode] = useState<'setup' | 'enter'>('enter')

  useEffect(() => {
    const checkAndPromptPassword = async () => {
      // Only prompt once per session
      if (promptedRef.current) return

      if (getSyncPassword()) {
        // Already have password - do initial check now
        await doInitialRestoreCheck(getSyncPassword()!)
        return
      }

      if (!isCloudBackupAvailable()) {
        initialCheckDoneRef.current = true
        return
      }

      const hasEncryption = await hasEncryptionPasswordSetup()
      if (hasEncryption) {
        // Has encryption but no session password - prompt to enter
        promptedRef.current = true
        setPasswordMode('enter')
        setShowPasswordModal(true)
      } else {
        // No encryption setup - allow sync
        initialCheckDoneRef.current = true
      }
    }

    const doInitialRestoreCheck = async (password: string) => {
      const [localEmpty, backupInfo] = await Promise.all([
        isLocalDataEmpty(),
        getBackupInfo(),
      ])

      if (backupInfo.exists && localEmpty) {
        console.log('[CloudSync] Local empty, restoring from cloud')
        const result = await restoreFromCloud(password)
        if (result.success) {
          window.location.reload()
          return
        }
      }

      initialCheckDoneRef.current = true
    }

    const unsubscribe = subscribeToAuth((state) => {
      if (state.user && !state.loading) {
        // Check after a short delay to let things settle
        setTimeout(() => void checkAndPromptPassword(), 1500)
      }
    })

    return unsubscribe
  }, [])

  const doInitialRestoreCheck = async (password: string) => {
    const [localEmpty, backupInfo] = await Promise.all([
      isLocalDataEmpty(),
      getBackupInfo(),
    ])

    if (backupInfo.exists && localEmpty) {
      console.log('[CloudSync] Local empty, restoring from cloud')
      const result = await restoreFromCloud(password)
      if (result.success) {
        window.location.reload()
        return
      }
    }

    initialCheckDoneRef.current = true
  }

  const handlePasswordSuccess = async (password: string) => {
    const isValid = await verifyEncryptionPassword(password)
    if (!isValid) return

    setSyncPassword(password)
    setShowPasswordModal(false)

    await doInitialRestoreCheck(password)
  }

  useEffect(() => {
    const doSync = async () => {
      // Prevent concurrent syncs
      if (isSyncingRef.current) return

      // Wait for initial restore check to complete
      if (!initialCheckDoneRef.current) return

      // Check if cloud backup is available
      if (!isCloudBackupAvailable()) return

      // Check if password is set up
      const hasPassword = await hasEncryptionPasswordSetup()
      if (!hasPassword) return

      // Get password from session
      const password = getSyncPassword()
      if (!password) return

      // Verify password is still valid
      const isValid = await verifyEncryptionPassword(password)
      if (!isValid) {
        console.log('[CloudSync] Stored password invalid, clearing')
        clearSyncPassword()
        return
      }

      isSyncingRef.current = true
      try {
        console.log('[CloudSync] Starting auto-sync (merge)...')
        const result = await syncMerge(password)
        if (result.success) {
          console.log('[CloudSync] Auto-sync completed')
        } else {
          console.warn('[CloudSync] Auto-sync failed:', result.error)
        }
      } finally {
        isSyncingRef.current = false
      }
    }

    // Subscribe to auth changes
    const unsubscribe = subscribeToAuth((state) => {
      if (state.user && !state.loading) {
        // User logged in - start sync interval
        if (!intervalRef.current) {
          // Initial sync after short delay
          setTimeout(() => void doSync(), 3000)

          // Periodic sync
          intervalRef.current = setInterval(
            () => void doSync(),
            config.syncIntervalMinutes * 60 * 1000
          )
        }
      } else {
        // User logged out - clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    })

    return () => {
      unsubscribe()
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return (
    <EncryptionPasswordModal
      isOpen={showPasswordModal}
      onClose={() => setShowPasswordModal(false)}
      mode={passwordMode}
      onSuccess={handlePasswordSuccess}
    />
  )
}
