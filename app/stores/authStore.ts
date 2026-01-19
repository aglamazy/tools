/**
 * Auth Store
 * Manages authentication state across the app
 */

import { subscribeToAuthState, type AuthUser } from '@/app/services/firebaseAuthService'

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

function notifyListeners() {
  listeners.forEach((listener) => listener(state))
}

/**
 * Initialize auth state listener
 * Should be called once when the app starts
 */
export function initializeAuth() {
  if (unsubscribeFirebase) return // Already initialized

  unsubscribeFirebase = subscribeToAuthState((user) => {
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
