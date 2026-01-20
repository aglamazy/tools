'use client'

import { useEffect } from 'react'
import { initializeAuth } from '@/app/stores/authStore'
import { isFirebaseConfigured } from '@/app/lib/firebase'
import { userTierStore } from '@/app/stores/userTierStore'

/**
 * Initializes Firebase auth state and user tier sync on app startup.
 * Should be rendered once in the root layout.
 */
export default function AuthInitializer() {
  useEffect(() => {
    if (isFirebaseConfigured()) {
      initializeAuth()
    }
    // Initialize tier sync (handles both Firebase and local modes)
    userTierStore.initAuthSync()
  }, [])

  return null
}
