'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { routes } from '@/app/config'
import { getCachedAvatar } from '@/app/stores/authStore'

/**
 * Redirects returning users (who have logged in before) straight to the
 * dashboard, skipping the public landing page. On the Saliko deployment,
 * `/app` is then rewritten by middleware to `/app/stores` — the redirect
 * target stays product-neutral.
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
