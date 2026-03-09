'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { subscribeToAuth } from '@/app/stores/authStore'
import { tcStore } from '@/app/stores/tcStore'
import { routes } from '@/app/config'

/**
 * Wraps dashboard content and redirects to /app/terms
 * if the logged-in user hasn't accepted the latest T&C version.
 * The terms page itself is excluded from the gate.
 */
export default function TcGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [tcState, setTcState] = useState(tcStore.get())

  useEffect(() => {
    const unsub = subscribeToAuth((s) => {
      setLoggedIn(s.user !== null)
      setAuthReady(s.initialized)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = tcStore.subscribe(setTcState)
    return unsub
  }, [])

  useEffect(() => {
    // Don't redirect if we're already on the terms page
    if (pathname === routes.terms) return
    // Don't redirect if auth hasn't initialized yet
    if (!authReady) return
    // Don't redirect if user is not logged in (let existing auth flow handle it)
    if (!loggedIn) return
    // Don't redirect while T&C status is still loading
    if (tcState.loading) return
    // Redirect if T&C not accepted
    if (!tcState.accepted) {
      router.replace(routes.terms)
    }
  }, [pathname, authReady, loggedIn, tcState, router])

  // While loading, show nothing extra (layout still renders header/sidebar)
  // On terms page, always render children
  if (pathname === routes.terms) {
    return <>{children}</>
  }

  // If logged in but T&C not accepted and not loading, don't show dashboard content
  if (authReady && loggedIn && !tcState.loading && !tcState.accepted) {
    return null
  }

  return <>{children}</>
}
