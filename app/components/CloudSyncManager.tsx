'use client'

import { useEffect, useRef, useState } from 'react'
import { subscribeToAuth } from '@/app/stores/authStore'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import {
  isCloudBackupAvailable,
  hasEncryptionPasswordSetup,
  syncMerge,
  verifyEncryptionPassword,
  restoreFromCloud,
  getBackupInfo,
} from '@/app/services/cloudBackupService'
import { isLocalDataEmpty } from '@/app/services/backupService'
import { syncAllSharedBusinesses, getSharedPassword } from '@/app/services/sharedBusinessSyncService'
import { config } from '@/app/config'
import EncryptionPasswordModal from './EncryptionPasswordModal'
import { useToast } from './ToastContainer'

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
  const { showToast } = useToast()

  // Listen for new shared business tasks
  useEffect(() => {
    const handler = (e: Event) => {
      const { count, businessName, businessId, tab } = (e as CustomEvent).detail
      const msg = count === 1
        ? `משימה חדשה ב-${businessName}`
        : `${count} משימות חדשות ב-${businessName}`
      const href = businessId ? `/app/business/${businessId}?tab=${tab || 'tasks'}` : undefined
      showToast('info', msg, undefined, undefined, href)
    }
    window.addEventListener('shared-business-new-tasks', handler)
    return () => window.removeEventListener('shared-business-new-tasks', handler)
  }, [showToast])

  useEffect(() => {
    const checkAndPromptPassword = async () => {
      // Only prompt once per session
      if (promptedRef.current) return

      // Only run on app pages, not public pages (landing, pricing, etc.)
      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      if (!path.startsWith('/app') && !path.startsWith('/business')) return

      // Cloud sync requires a paid tier
      if (!userTierStore.hasAccess(UserTier.HOME)) return

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
        const result = await restoreFromCloud(password)
        if (result.success) {
          // Check if data was actually imported before reloading
          const stillEmpty = await isLocalDataEmpty()
          if (!stillEmpty) {
            window.location.reload()
            return
          }
          console.warn('[CloudSync] Restore succeeded but local still empty — skipping reload to avoid loop')
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
    const runSync = async () => {
      if (isSyncingRef.current) return
      if (!userTierStore.hasAccess(UserTier.HOME)) return
      if (!initialCheckDoneRef.current) return
      if (!isCloudBackupAvailable()) return

      const hasPassword = await hasEncryptionPasswordSetup()
      if (!hasPassword) return

      const password = getSyncPassword()
      if (!password) return

      const isValid = await verifyEncryptionPassword(password)
      if (!isValid) {
        clearSyncPassword()
        return
      }

      isSyncingRef.current = true
      try {
        const result = await syncMerge(password)
        if (result.success) {
          console.log('[CloudSync] Sync completed (leader)')
        } else {
          console.warn('[CloudSync] Sync failed:', result.error)
        }
      } finally {
        isSyncingRef.current = false
      }
    }

    const doSync = async () => {
      // Multi-tab leader election: only the lock holder runs sync this round.
      // Other tabs skip; next interval re-elects, so a closed tab is replaced.
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(
          'aglamazo-cloud-sync',
          { mode: 'exclusive', ifAvailable: true },
          async (lock) => {
            if (!lock) return // another tab leads this round
            await runSync()
          }
        )
      } else {
        await runSync()
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

  // Independent shared business sync — runs regardless of personal sync/tier
  useEffect(() => {
    const sharedIntervalRef = { current: null as NodeJS.Timeout | null }
    const isSyncingShared = { current: false }

    const runSharedSync = async () => {
      if (isSyncingShared.current) return
      isSyncingShared.current = true
      try {
        await syncAllSharedBusinesses(getSharedPassword)
      } catch (err) {
        console.error('[CloudSync] Shared business sync error:', err)
      } finally {
        isSyncingShared.current = false
      }
    }

    const doSharedSync = async () => {
      // Same leader-election pattern as personal sync, separate lock so the two can run in parallel across tabs.
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(
          'aglamazo-shared-sync',
          { mode: 'exclusive', ifAvailable: true },
          async (lock) => {
            if (!lock) return
            await runSharedSync()
          }
        )
      } else {
        await runSharedSync()
      }
    }

    const unsubscribe = subscribeToAuth((state) => {
      if (state.user && !state.loading) {
        if (!sharedIntervalRef.current) {
          setTimeout(() => void doSharedSync(), 5000)
          sharedIntervalRef.current = setInterval(
            () => void doSharedSync(),
            config.syncIntervalMinutes * 60 * 1000,
          )
        }
      } else {
        if (sharedIntervalRef.current) {
          clearInterval(sharedIntervalRef.current)
          sharedIntervalRef.current = null
        }
      }
    })

    return () => {
      unsubscribe()
      if (sharedIntervalRef.current) {
        clearInterval(sharedIntervalRef.current)
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
