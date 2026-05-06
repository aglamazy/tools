'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { routes } from '@/app/config'
import { clearCachedAvatar, getCachedAvatar, subscribeToAuth } from '@/app/stores/authStore'

/**
 * Redirects returning users (who have logged in before) straight to the
 * dashboard, skipping the public landing.
 *
 * The cached avatar is a hint — the source of truth is Firebase auth. If
 * the cache is stale (e.g. user signed into a different Firebase project,
 * or token expired) we clear it instead of redirecting to a half-broken
 * dashboard. Without this guard the dashboard renders, fails its own auth
 * check, and surfaces "Not authenticated" — surprising the user.
 */
export default function ReturningUserRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (!getCachedAvatar()) return

    const unsub = subscribeToAuth(({ user, initialized }) => {
      if (!initialized) return
      if (user) {
        router.replace(routes.dashboard)
      } else {
        clearCachedAvatar()
      }
    })
    return unsub
  }, [router])

  return null
}
