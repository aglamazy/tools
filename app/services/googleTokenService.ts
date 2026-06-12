/**
 * Google Token Service
 * Manages OAuth2 access + refresh tokens for Google APIs (Calendar, Drive).
 * Tokens are stored in IndexedDB via the existing appSettings table.
 *
 * NOTE: The refresh token is stored with key 'google_refresh_token' in appSettings.
 * backupService.ts filters out keys starting with 'google_' on both export AND
 * import paths, and applyMergedBackupService strips them from incoming cloud
 * records — so the tokens stay strictly device-local and don't get clobbered
 * by a CloudSync that ran on a different device with no consent yet.
 */

import { db } from '@/app/db/financeDB'

// Per-feature Google data-access scopes. NO LONGER bundled into login —
// login is identity-only (`openid email profile`) per #39. The feature
// buttons (Drive upload, Gmail receipt-scrape, Calendar read) call
// requestGoogleAccess() at the moment the user opts in, the popup shows
// once per ~6-month refresh-token lifetime, and tokens live in Dexie
// (browser-only — server never sees them).
//
// `openid` is still listed first so that the popup also returns an
// id_token alongside the access+refresh pair — useful for verifying the
// granting Google identity matches the logged-in Firebase user.
const SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic'

// Refresh-token retention. Google's web refresh tokens are valid for ~6
// months of inactivity; we don't proactively shorten that. Users can
// revoke at any time via Google Account → Security → Third-party apps,
// and clearGoogleAccess() wipes the local copy.

// Keys used in appSettings
const KEY_ACCESS_TOKEN = 'google_access_token'
const KEY_REFRESH_TOKEN = 'google_refresh_token'
const KEY_TOKEN_EXPIRY = 'google_token_expiry'

// Buffer before actual expiry to trigger refresh (5 minutes)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

/** Keys that must be excluded from sync/backup */
export const GOOGLE_TOKEN_SETTING_KEYS = [KEY_ACCESS_TOKEN, KEY_REFRESH_TOKEN, KEY_TOKEN_EXPIRY]

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getSetting(key: string): Promise<any | null> {
  const row = await db.appSettings.where('key').equals(key).first()
  return row ? row.value : null
}

async function putSetting(key: string, value: any): Promise<void> {
  const existing = await db.appSettings.where('key').equals(key).first()
  if (existing) {
    await db.appSettings.update(existing.id!, {
      value,
      updatedAt: new Date().toISOString(),
    })
  } else {
    await db.appSettings.add({
      key,
      value,
      updatedAt: new Date().toISOString(),
    })
  }
}

async function deleteSetting(key: string): Promise<void> {
  const existing = await db.appSettings.where('key').equals(key).first()
  if (existing) {
    await db.appSettings.delete(existing.id!)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if we have a valid (non-expired) Google access token.
 */
export async function hasGoogleAccess(): Promise<boolean> {
  const [token, expiry] = await Promise.all([
    getSetting(KEY_ACCESS_TOKEN),
    getSetting(KEY_TOKEN_EXPIRY),
  ])
  if (!token) return false
  if (!expiry) return false
  return Date.now() < (expiry as number) - EXPIRY_BUFFER_MS
}

/**
 * Return a valid access token, refreshing silently if expired.
 * Returns null if no refresh token is available.
 */
export async function getAccessToken(): Promise<string | null> {
  // Check if current token is still valid
  const [token, expiry, refreshToken] = await Promise.all([
    getSetting(KEY_ACCESS_TOKEN),
    getSetting(KEY_TOKEN_EXPIRY),
    getSetting(KEY_REFRESH_TOKEN),
  ])

  if (token && expiry && Date.now() < (expiry as number) - EXPIRY_BUFFER_MS) {
    return token as string
  }

  // Try to refresh
  if (!refreshToken) return null

  try {
    const res = await fetch('/api/auth/google-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!res.ok) {
      // Only clear tokens on a definite "your refresh token is dead" signal
      // from Google. Transient 4xx/5xx (rate limits, network blips, server
      // hiccups) used to nuke the refresh token too — which forced the user
      // to re-grant Gmail consent next time, which surfaced as "Google auth
      // popup keeps appearing." Keep tokens; the next call will retry.
      const body = await res.json().catch(() => ({} as any))
      const isInvalidGrant = body?.errorCode === 'invalid_grant'
      console.error('[GoogleToken] Refresh failed:', res.status, body, 'invalidGrant=', isInvalidGrant)
      if (isInvalidGrant) {
        await clearGoogleAccess()
      }
      return null
    }

    const data = await res.json()
    const newExpiry = Date.now() + (data.expiresIn as number) * 1000

    await Promise.all([
      putSetting(KEY_ACCESS_TOKEN, data.accessToken),
      putSetting(KEY_TOKEN_EXPIRY, newExpiry),
    ])

    return data.accessToken as string
  } catch (err) {
    console.error('[GoogleToken] Refresh error:', err)
    return null
  }
}

/**
 * Trigger the one-time OAuth consent popup.
 * Opens Google's authorization URL in a popup window, receives the code
 * via postMessage from the callback page, then exchanges it for tokens.
 *
 * The exchange now also returns an `idToken` (because SCOPES includes
 * `openid`) — callers that want to bundle this with Firebase sign-in
 * (see signInWithGoogleBundled in firebaseAuthService.ts) can use it
 * directly. Plain "I just need Gmail scopes" callers can ignore it.
 */
export async function requestGoogleAccess(): Promise<{ success: boolean; error?: string; idToken?: string }> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) {
    return { success: false, error: 'Google Client ID not configured' }
  }

  const redirectUri = `${window.location.origin}/api/auth/google-token/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  return new Promise((resolve) => {
    // Open popup
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(
      authUrl,
      'google-oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    )

    if (!popup) {
      resolve({ success: false, error: 'Popup was blocked. Please allow popups and try again.' })
      return
    }

    // Listen for the callback postMessage
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'google-oauth-callback') return

      window.removeEventListener('message', onMessage)
      clearInterval(pollTimer)

      if (event.data.error) {
        resolve({ success: false, error: event.data.error })
        return
      }

      if (!event.data.code) {
        resolve({ success: false, error: 'No authorization code received' })
        return
      }

      // Exchange the code for tokens
      try {
        const res = await fetch('/api/auth/google-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: event.data.code, redirectUri }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          resolve({ success: false, error: errData.error || 'Token exchange failed' })
          return
        }

        const data = await res.json()
        const expiry = Date.now() + (data.expiresIn as number) * 1000

        await Promise.all([
          putSetting(KEY_ACCESS_TOKEN, data.accessToken),
          putSetting(KEY_TOKEN_EXPIRY, expiry),
          ...(data.refreshToken ? [putSetting(KEY_REFRESH_TOKEN, data.refreshToken)] : []),
        ])

        resolve({ success: true, idToken: data.idToken })
      } catch (err: any) {
        console.error('[GoogleToken] Code exchange error:', err)
        resolve({ success: false, error: 'Failed to exchange authorization code' })
      }
    }

    window.addEventListener('message', onMessage)

    // Poll to detect if user closed the popup without completing auth
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer)
        window.removeEventListener('message', onMessage)
        resolve({ success: false, error: 'Authentication window was closed' })
      }
    }, 500)
  })
}

/**
 * Remove all stored Google tokens.
 */
export async function clearGoogleAccess(): Promise<void> {
  await Promise.all([
    deleteSetting(KEY_ACCESS_TOKEN),
    deleteSetting(KEY_REFRESH_TOKEN),
    deleteSetting(KEY_TOKEN_EXPIRY),
  ])
}
