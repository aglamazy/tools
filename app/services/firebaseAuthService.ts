/**
 * Firebase Auth Service
 * Handles user authentication with email/password
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateProfile,
  type User,
  type Unsubscribe,
} from 'firebase/auth'
import { getFirebaseAuth, isFirebaseConfigured } from '@/app/lib/firebase'
import { requestGoogleAccess } from '@/app/services/googleTokenService'

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
 * Sign in with Google — single-popup, all-scopes-at-once flow.
 *
 * Uses one OAuth code-flow popup that requests both:
 *   - openid + email + profile  (for Firebase sign-in via id_token)
 *   - calendar.readonly, drive.file, gmail.modify, gmail.settings.basic
 *     (for the Google APIs we use — stored as access + refresh tokens
 *     in IndexedDB by googleTokenService.requestGoogleAccess).
 *
 * Net effect: one user gesture grants everything. The Gmail/Drive/Calendar
 * actions later in the session don't need a second consent popup.
 *
 * Falls back to the basic Firebase signInWithPopup if the bundled flow
 * fails (e.g. server-side OAuth env missing). The fallback works but
 * any later Gmail send will need a mid-session consent popup.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isFirebaseConfigured()) {
    return { success: false, error: 'Firebase not configured', errorCode: 'not-configured' }
  }

  try {
    // Bundled flow: one popup grants Firebase auth + all Google API scopes.
    const result = await requestGoogleAccess()
    if (result.success && result.idToken) {
      const auth = getFirebaseAuth()
      const credential = GoogleAuthProvider.credential(result.idToken)
      try {
        const userCred = await signInWithCredential(auth, credential)

        // Best-effort: claim any pre-provisioned tier for this email
        try {
          const idToken = await userCred.user.getIdToken()
          await fetch('/api/auth/claim-provision', {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
          })
        } catch { /* non-blocking */ }

        return { success: true, user: toAuthUser(userCred.user) }
      } catch (credErr: any) {
        // Firebase rejected the bundled-flow id_token (commonly: the
        // bundled OAuth client is in a different GCP project than Firebase
        // and isn't on Auth → Google → Web SDK whitelist — see task #39).
        // The bundled popup ALREADY opened, so re-popping would surface
        // a SECOND Google picker (task #40). Surface a clean error.
        console.error(
          '[Auth] Bundled-flow id_token rejected by Firebase (' + credErr?.code +
          '). NOT falling back — bundled picker already shown. Fix: Firebase ' +
          'Console → Auth → Google → Web SDK config → whitelist client ID (#39).',
        )
        return {
          success: false,
          error: 'שגיאה באימות עם Google',
          errorCode: credErr?.code || 'bundled-credential-rejected',
        }
      }
    }

    // Bundled-popup-opened-but-no-idToken guard (per sub-agent #40 finding):
    // SCOPES missing `openid`, Google flake — picker already shown, must NOT
    // re-popup. Surface instead.
    if (result.success && !result.idToken) {
      console.error('[Auth] Bundled Google sign-in succeeded but returned no id_token; not falling back to avoid a second picker')
      return {
        success: false,
        error: 'שגיאה בהתחברות עם Google',
        errorCode: 'bundled-no-idtoken',
      }
    }

    // Bundled flow failed BEFORE opening any picker (server OAuth env
    // missing, client_id not configured, popup blocked). Safe to fall
    // back to plain Firebase popup — no picker has been shown yet.
    console.warn('[Auth] Bundled Google sign-in failed before opening picker; falling back to basic Firebase popup:', result.error)
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()
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
