'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { routes } from '@/app/config'
import { getCachedAvatar } from '@/app/stores/authStore'

/**
 * Redirects returning users (who have logged in before) straight to the dashboard,
 * skipping the landing page.
 */
export default function ReturningUserRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (getCachedAvatar()) {
      router.replace(routes.dashboard)
    }
  }, [router])

  return null
}
