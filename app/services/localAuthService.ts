/**
 * Local Auth Service
 * Authenticates via server API, then signs into Firebase with a custom token.
 * This gives a real Firebase session that works on unregistered domains (Vercel previews).
 */

import { signInWithCustomToken, updateProfile } from 'firebase/auth'
import { getFirebaseAuth } from '@/app/lib/firebase'

export type LocalAuthResult = {
  success: boolean
  error?: string
}

export async function signInLocal(username: string, password: string): Promise<LocalAuthResult> {
  try {
    const res = await fetch('/api/auth/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()

    if (!data.success) {
      return { success: false, error: data.error }
    }

    // Sign into Firebase with the custom token — gives a real session
    const auth = getFirebaseAuth()
    const credential = await signInWithCustomToken(auth, data.customToken)
    await updateProfile(credential.user, { displayName: username })

    return { success: true }
  } catch (err) {
    console.error('[LocalAuth] Sign in failed:', err)
    return { success: false, error: 'שגיאת התחברות' }
  }
}
