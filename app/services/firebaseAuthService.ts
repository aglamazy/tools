/**
 * Firebase Auth Service
 * Handles user authentication with email/password
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  updateProfile,
  type User,
  type Unsubscribe,
} from 'firebase/auth'
import { getFirebaseAuth, isFirebaseConfigured } from '@/app/lib/firebase'
import { markUserInitiatedSignOut } from './signOutIntent'

export type AuthUser = {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export type AuthResult = {
  success: boolean
  user?: AuthUser
  error?: string
  errorCode?: string
}

/**
 * Convert Firebase User to AuthUser
 */
function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  }
}

/**
 * Get ID token for authenticated API requests
 */
export async function getIdToken(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null

  const auth = getFirebaseAuth()
  // On cold-start, `auth.currentUser` may be null while Firebase finishes
  // restoring the session from IndexedDB. Without awaiting, every early
  // API call (partnerStore.refresh, household/info, business-share/list)
  // returns "not-authenticated" and the call cache locks at empty until
  // the user manually navigates. authStateReady() resolves on first user
  // hydration (or no-user) — typically ~50–300ms.
  try {
    if (typeof (auth as any).authStateReady === 'function') {
      await (auth as any).authStateReady()
    }
  } catch { /* fallthrough to currentUser check */ }
  const user = auth.currentUser
  if (!user) return null

  try {
    return await user.getIdToken()
  } catch (error) {
    console.error('[Auth] Failed to get ID token:', error)
    return null
  }
}

/**
 * Force refresh the ID token to get latest custom claims
 */
export async function refreshIdToken(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) return null

  try {
    return await user.getIdToken(true)
  } catch (error) {
    console.error('[Auth] Failed to refresh ID token:', error)
    return null
  }
}

/**
 * Get current authenticated user
 */
export function getCurrentUser(): AuthUser | null {
  if (!isFirebaseConfigured()) return null

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  return user ? toAuthUser(user) : null
}

/**
 * Subscribe to auth state changes
 */
export function subscribeToAuthState(
  callback: (user: AuthUser | null) => void
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback(null)
    return () => {}
  }

  const auth = getFirebaseAuth()
  return onAuthStateChanged(auth, (user) => {
    callback(user ? toAuthUser(user) : null)
  })
}

/**
 * Register new user with email and password
 */
export async function registerWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase not configured', errorCode: 'not-configured' }
  }

  try {
    const auth = getFirebaseAuth()
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    return {
      success: true,
      user: toAuthUser(credential.user),
    }
  } catch (err: any) {
    console.error('[Auth] Register failed:', err.code, err.message)
    return {
      success: false,
      error: getErrorMessage(err.code),
      errorCode: err.code,
    }
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase not configured', errorCode: 'not-configured' }
  }

  try {
    const auth = getFirebaseAuth()
    const credential = await signInWithEmailAndPassword(auth, email, password)
    return {
      success: true,
      user: toAuthUser(credential.user),
    }
  } catch (err: any) {
    console.error('[Auth] Sign in failed:', err.code, err.message)
    return {
      success: false,
      error: getErrorMessage(err.code),
      errorCode: err.code,
    }
  }
}

/**
 * Sign in with Google — identity-only.
 *
 * Login requests `openid email profile` ONLY (Firebase's default Google
 * provider scopes). The previous bundled flow that also asked for
 * gmail.modify / calendar.readonly / drive.file at login was killed for
 * two reasons (#39):
 *   1. Privacy policy — admin / Google must not be in a position to read
 *      finance/personal data. Bundling auth + data-access at login means
 *      tokens for Gmail/Drive/Calendar are minted even when the user has
 *      no intention of using those features.
 *   2. Verification — the heavy scopes (especially `gmail.modify`, a
 *      Restricted scope) trigger Google's "unverified app" warning at
 *      consent, which we don't want gating login. Identity scopes alone
 *      are publishable to Production with no verification.
 *
 * Per-feature data access (Gmail receipt-scrape, Drive upload, Calendar
 * read) goes through googleTokenService.requestGoogleAccess(), invoked
 * lazily from the feature button. The refresh token there is stored
 * client-side (Dexie) and survives for ~6 months of inactivity, so the
 * consent popup shows once per feature.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase not configured', errorCode: 'not-configured' }
  }

  try {
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()
    // Always show Google's account chooser. Without it Google silently reuses the
    // one session already in the browser, so a second account (a new email to
    // register) could never be picked.
    provider.setCustomParameters({ prompt: 'select_account' })
    const cred = await signInWithPopup(auth, provider)

    try {
      const idToken = await cred.user.getIdToken()
      await fetch('/api/auth/claim-provision', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })
    } catch { /* non-blocking */ }

    return { success: true, user: toAuthUser(cred.user) }
  } catch (err: any) {
    console.error('[Auth] Google sign in failed:', err.code, err.message)
    return {
      success: false,
      error: getErrorMessage(err.code),
      errorCode: err.code,
    }
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase not configured' }
  }

  try {
    const auth = getFirebaseAuth()
    // Only a real user-initiated sign-out may wipe local data (aglamazo#413).
    if (auth.currentUser) markUserInitiatedSignOut()
    await firebaseSignOut(auth)
    return { success: true }
  } catch (err: any) {
    console.error('[Auth] Sign out failed:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Change password for email/password users (requires current password for re-auth)
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase not configured' }
  }

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user || !user.email) {
    return { success: false, error: 'לא מחובר' }
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword)
    await reauthenticateWithCredential(user, credential)
    await updatePassword(user, newPassword)
    return { success: true }
  } catch (err: any) {
    console.error('[Auth] Change password failed:', err.code, err.message)
    return { success: false, error: getErrorMessage(err.code) }
  }
}

export type ReauthMethod = 'password' | 'google' | 'unsupported'

/** Which way the signed-in user proves who they are again; null when nobody is signed in. */
export function getReauthMethod(): ReauthMethod | null {
  if (!isFirebaseConfigured()) return null
  const user = getFirebaseAuth().currentUser
  if (!user) return null
  const providers = user.providerData.map((p) => p.providerId)
  if (providers.includes('password')) return 'password'
  if (providers.includes('google.com')) return 'google'
  return 'unsupported'
}

/**
 * Fresh sign-in for a sensitive action (account deletion). Password users
 * re-enter their password; Google users go through the Google popup again.
 * Afterwards the ID token is refreshed so its `auth_time` is current — the
 * server refuses a deletion whose sign-in is older than 5 minutes.
 */
export async function reauthenticate(password?: string): Promise<{ success: boolean; error?: string; errorCode?: string }> {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase not configured', errorCode: 'not-configured' }
  const user = getFirebaseAuth().currentUser
  if (!user) return { success: false, error: 'לא מחובר', errorCode: 'not-signed-in' }

  try {
    const method = getReauthMethod()
    if (method === 'password') {
      if (!user.email || !password) return { success: false, error: 'נדרשת סיסמה', errorCode: 'password-required' }
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
    } else if (method === 'google') {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ login_hint: user.email ?? '' })
      await reauthenticateWithPopup(user, provider)
    } else {
      return { success: false, error: 'שיטת ההתחברות אינה נתמכת לאימות מחדש', errorCode: 'unsupported-provider' }
    }
    await user.getIdToken(true)
    return { success: true }
  } catch (err: any) {
    console.error('[Auth] Re-authentication failed:', err.code, err.message)
    return { success: false, error: getErrorMessage(err.code), errorCode: err.code }
  }
}

/**
 * Update user display name
 */
export async function updateDisplayName(displayName: string): Promise<{ success: boolean; error?: string }> {
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase not configured' }
  }

  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (!user) {
    return { success: false, error: 'לא מחובר' }
  }

  try {
    await updateProfile(user, { displayName })
    return { success: true }
  } catch (err: any) {
    console.error('[Auth] Update display name failed:', err.code, err.message)
    return { success: false, error: 'שגיאה בעדכון שם התצוגה' }
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase not configured' }
  }

  try {
    const auth = getFirebaseAuth()
    await sendPasswordResetEmail(auth, email)
    return { success: true }
  } catch (err: any) {
    console.error('[Auth] Password reset failed:', err.code, err.message)
    return { success: false, error: getErrorMessage(err.code) }
  }
}

/**
 * Convert Firebase error codes to Hebrew messages
 */
function getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'כתובת האימייל כבר בשימוש'
    case 'auth/invalid-email':
      return 'כתובת אימייל לא תקינה'
    case 'auth/operation-not-allowed':
      return 'הרשמה באימייל לא מופעלת'
    case 'auth/weak-password':
      return 'הסיסמה חלשה מדי (מינימום 6 תווים)'
    case 'auth/user-disabled':
      return 'המשתמש הושבת'
    case 'auth/user-not-found':
      return 'משתמש לא נמצא'
    case 'auth/wrong-password':
      return 'סיסמה שגויה'
    case 'auth/invalid-credential':
      return 'פרטי התחברות שגויים'
    case 'auth/too-many-requests':
      return 'יותר מדי ניסיונות. נסה שוב מאוחר יותר'
    case 'auth/network-request-failed':
      return 'שגיאת רשת. בדוק את החיבור לאינטרנט'
    case 'auth/popup-closed-by-user':
      return 'החלון נסגר לפני השלמת ההתחברות'
    case 'auth/popup-blocked':
      return 'החלון נחסם. אפשר חלונות קופצים ונסה שוב'
    case 'auth/cancelled-popup-request':
      return 'בקשת ההתחברות בוטלה'
    case 'auth/account-exists-with-different-credential':
      return 'קיים חשבון עם אימייל זה בשיטת התחברות אחרת'
    default:
      return 'שגיאה בהתחברות'
  }
}
