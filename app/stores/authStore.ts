/**
 * Auth Store
 * Manages authentication state across the app
 * Also fetches user tier from Firestore on login
 */

import { subscribeToAuthState, type AuthUser } from '@/app/services/firebaseAuthService'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import {
  handleSignOutTransition,
  reconcileStaleSession,
  rememberSignedInAccount,
} from '@/app/services/deviceAccountReconciler'
import { consumeUserInitiatedSignOut } from '@/app/services/signOutIntent'
import type { DeviceAccountRefs } from '@/app/services/deviceAccountState'

export type { AuthUser }

type AuthState = {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
}

type Listener = (state: AuthState) => void

let state: AuthState = {
  user: null,
  loading: true,
  initialized: false,
}

const listeners = new Set<Listener>()
let unsubscribeFirebase: (() => void) | null = null
// The account this tab is signed in as, kept in memory so a sign-out can still
// say WHICH account it was after the user object is gone (aglamazo#413).
let signedInRefs: DeviceAccountRefs | null = null

function logAccountStateError(err: unknown) {
  console.error('[Auth] device account state update failed:', err)
}

function notifyListeners() {
  listeners.forEach((listener) => listener(state))
}

/**
 * Initialize auth state listener
 * Should be called once when the app starts
 * Also subscribes to user tier from Firestore
 */
export function initializeAuth() {
  if (unsubscribeFirebase) return // Already initialized

  unsubscribeFirebase = subscribeToAuthState((user) => {
    const wasSignedIn = state.user !== null

    if (user) {
      userTierStore.subscribeFirestore(user.uid)
      rememberSignedInAccount(user.uid)
        .then((refs) => {
          signedInRefs = refs
        })
        .catch(logAccountStateError)
    } else {
      userTierStore.unsubscribeFirestore()
      userTierStore.set(UserTier.FREE)
      const previousRefs = signedInRefs
      signedInRefs = null
      if (wasSignedIn) {
        // Sign-out transition (was signed in, now isn't). A user-initiated one
        // wipes local caches so the next user in this browser doesn't see stale
        // data; a forced one (e.g. the account was deleted) first finds out
        // why, and never wipes local data on the account's behalf.
        void handleSignOutTransition(previousRefs, consumeUserInitiatedSignOut()).catch(logAccountStateError)
      } else {
        // Loaded already signed out — if this browser remembers an account,
        // find out whether it was deleted while the device was away.
        consumeUserInitiatedSignOut()
        void reconcileStaleSession().catch(logAccountStateError)
      }
    }

    state = {
      user,
      loading: false,
      initialized: true,
    }
    notifyListeners()
  })
}

/**
 * Get current auth state
 */
export function getAuthState(): AuthState {
  return state
}

/**
 * Subscribe to auth state changes
 */
export function subscribeToAuth(listener: Listener): () => void {
  listeners.add(listener)
  // Immediately call with current state
  listener(state)

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return state.user !== null
}

/**
 * Set a local auth user directly (bypasses Firebase, used by localAuthService)
 */
export function setBootstrapUser(user: AuthUser | null) {
  state = { user, loading: false, initialized: true }
  notifyListeners()
}

/**
 * Get current user
 */
export function getUser(): AuthUser | null {
  return state.user
}

// Avatar cache for fast initial render
const AVATAR_CACHE_KEY = 'user_avatar_cache'

type AvatarCache = {
  url: string
  email: string
}

export function getCachedAvatar(): AvatarCache | null {
  try {
    const cached = localStorage.getItem(AVATAR_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

export function setCachedAvatar(url: string, email: string): void {
  try {
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify({ url, email }))
  } catch {
    // Ignore storage errors
  }
}

export function clearCachedAvatar(): void {
  try {
    localStorage.removeItem(AVATAR_CACHE_KEY)
  } catch {
    // Ignore storage errors
  }
}
