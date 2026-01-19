'use client'

import { useEffect } from 'react'
import { initializeAuth } from '@/app/stores/authStore'
import { isFirebaseConfigured } from '@/app/lib/firebase'

/**
 * Initializes Firebase auth state on app startup.
 * Should be rendered once in the root layout.
 */
export default function AuthInitializer() {
  useEffect(() => {
    if (isFirebaseConfigured()) {
      initializeAuth()
    }
  }, [])

  return null
}
