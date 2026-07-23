/**
 * mypips.app Firebase auth client (plantonic-eco project).
 *
 * mypips offers only Google sign-in — no email/password login.  The one-time
 * interactive Google login produces a Firebase refreshToken (see
 * scripts/mypips-capture-token.md for the capture procedure).  From then on
 * this client exchanges the stored refresh token for fresh Firebase ID tokens
 * via securetoken.googleapis.com — no further Google interaction required.
 *
 * Token rotation: Firebase issues a new refreshToken on each exchange.  The
 * new token is persisted to Aglamazo's Firestore at _salikoAuth/mypips so
 * subsequent calls always use the most recent one, even across restarts.
 *
 * Bootstrap: set MYPIPS_REFRESH_TOKEN in .env.local (value comes from
 * ~/develop/Buddy/secrets/mypips-refresh-token, captured once interactively).
 * After the first successful exchange the token is self-managing via Firestore.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

// Firebase Web API key for plantonic-eco (a third-party project) — held in .env.local, never committed
const FIREBASE_API_KEY = process.env.MYPIPS_FIREBASE_API_KEY

// Firebase uid of the household account (yaakov.aglamaz@gmail.com)
export const MYPIPS_LOCAL_ID = 'GnUkCt101SWCXYj9V7uMsX3LPFG3'

export const MYPIPS_PROJECT_ID = 'plantonic-eco'

// Firestore REST base for authenticated reads/writes against mypips's project
export const MYPIPS_FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${MYPIPS_PROJECT_ID}/databases/(default)/documents`

// Firebase ID tokens are valid for 1 hour — cache with 5-minute headroom
const TOKEN_EXPIRY_MS = 55 * 60 * 1000

// Module-level in-process cache (survives within a single server instance)
let _cachedToken: string | null = null
let _cacheExpiresAt = 0

// Aglamazo Firestore path for persisting the rotated mypips refresh token
const FIRESTORE_COL = '_salikoAuth'
const FIRESTORE_DOC = 'mypips'

interface MypipsAuthDoc {
  refreshToken: string
  localId: string
  updatedAt: string
}

async function loadStoredRefreshToken(): Promise<string | null> {
  // 1. Firestore takes precedence — holds the most-recently-rotated token
  try {
    const db = getAdminFirestore()
    const snap = await db.collection(FIRESTORE_COL).doc(FIRESTORE_DOC).get()
    if (snap.exists) {
      const data = snap.data() as MypipsAuthDoc
      if (data?.refreshToken) {
        console.log('[MypipsAuth] loaded refresh token from Firestore (_salikoAuth/mypips)')
        return data.refreshToken
      }
    }
  } catch (err) {
    console.warn('[MypipsAuth] Firestore load failed, falling back to env:', (err as Error).message)
  }

  // 2. Bootstrap path: env var populated from Buddy secrets on first deploy
  const envToken = process.env.MYPIPS_REFRESH_TOKEN
  if (envToken) {
    console.log('[MypipsAuth] using bootstrap refresh token from MYPIPS_REFRESH_TOKEN env')
    return envToken
  }

  return null
}

async function persistRefreshToken(refreshToken: string): Promise<void> {
  try {
    const db = getAdminFirestore()
    const doc: MypipsAuthDoc = {
      refreshToken,
      localId: MYPIPS_LOCAL_ID,
      updatedAt: new Date().toISOString(),
    }
    await db.collection(FIRESTORE_COL).doc(FIRESTORE_DOC).set(doc)
    console.log('[MypipsAuth] persisted rotated refresh token to Firestore')
  } catch (err) {
    // Log but don't throw — the ID token is still good for 55 minutes even if
    // we can't persist the rotated refresh token this call.
    console.error('[MypipsAuth] failed to persist rotated refresh token:', (err as Error).message)
  }
}

/**
 * Returns a valid Firebase ID token for mypips.app.
 *
 * Use this token as `Authorization: Bearer <token>` for authenticated
 * Firestore REST reads/writes against the plantonic-eco project.
 *
 * Throws MypipsAuthError when no refresh token is available.
 */
export async function getMypipsIdToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cacheExpiresAt) {
    return _cachedToken
  }

  if (!FIREBASE_API_KEY) {
    throw new MypipsAuthError(
      'MYPIPS_FIREBASE_API_KEY is not set. Add it to .env.local ' +
      '(see scripts/mypips-capture-token.md).',
    )
  }

  const refreshToken = await loadStoredRefreshToken()
  if (!refreshToken) {
    throw new MypipsAuthError(
      'No mypips refresh token available. ' +
      'Set MYPIPS_REFRESH_TOKEN in .env.local (capture via supervised Google login — ' +
      'see scripts/mypips-capture-token.md).',
    )
  }

  const resp = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    },
  )

  if (!resp.ok) {
    const body = await resp.text()
    throw new MypipsAuthError(`Token refresh failed HTTP ${resp.status}: ${body}`)
  }

  const data = await resp.json() as {
    id_token: string
    refresh_token: string
    expires_in: string
    user_id: string
  }

  _cachedToken = data.id_token
  _cacheExpiresAt = Date.now() + TOKEN_EXPIRY_MS

  // Firebase rotates the refresh token on each exchange — persist the new one
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await persistRefreshToken(data.refresh_token)
  }

  console.log(`[MypipsAuth] ID token refreshed (uid=${data.user_id})`)
  return _cachedToken
}

export class MypipsAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MypipsAuthError'
  }
}
