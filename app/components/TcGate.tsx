'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { subscribeToAuth } from '@/app/stores/authStore'
import { userTierStore } from '@/app/stores/userTierStore'
import { config, routes } from '@/app/config'
import { db } from '@/app/db/financeDB'

/**
 * Wraps dashboard content and redirects to /app/terms
 * if the user hasn't accepted the latest T&C version.
 * Logged-in users: checked via Firestore (userTierStore).
 * Free/anonymous users: checked via local appSettings.
 * The terms page itself is excluded from the gate.
 */
export default function TcGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [tcState, setTcState] = useState(userTierStore.getTcState())
  const [localTcAccepted, setLocalTcAccepted] = useState<boolean | null>(null) // null = loading

  useEffect(() => {
    const unsub = subscribeToAuth((s) => {
      setLoggedIn(s.user !== null)
      setAuthReady(s.initialized)
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = userTierStore.subscribeTc(setTcState)
    return unsub
  }, [])

  // Check local T&C acceptance for free/anonymous users
  useEffect(() => {
    db.appSettings.where('key').equals('tcAcceptedAt').first().then(row => {
      const accepted = typeof row?.value === 'string' && row.value >= config.tcVersion
      setLocalTcAccepted(accepted)
    }).catch(() => setLocalTcAccepted(false))

    const handleTcAccepted = () => setLocalTcAccepted(true)
    window.addEventListener('local-tc-accepted', handleTcAccepted)
    return () => window.removeEventListener('local-tc-accepted', handleTcAccepted)
  }, [])

  useEffect(() => {
    if (pathname === routes.terms) return
    if (!authReady) return

    if (loggedIn) {
      // Logged-in: use Firestore-backed T&C state
      if (tcState.loading) return
      if (!tcState.accepted) router.replace(routes.terms)
    } else {
      // Free/anonymous: use local appSettings
      if (localTcAccepted === null) return // still loading
      if (!localTcAccepted) router.replace(routes.terms)
    }
  }, [pathname, authReady, loggedIn, tcState, localTcAccepted, router])

  if (pathname === routes.terms) {
    return <>{children}</>
  }

  // Block content while T&C not accepted
  if (authReady && loggedIn && !tcState.loading && !tcState.accepted) {
    return null
  }
  if (authReady && !loggedIn && localTcAccepted === false) {
    return null
  }

  return <>{children}</>
}
