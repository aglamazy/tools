/**
 * Google Token Service
 * Manages OAuth2 access + refresh tokens for Google APIs (Calendar, Drive).
 * Tokens are stored in IndexedDB via the existing appSettings table.
 *
 * NOTE: The refresh token is stored with key 'google_refresh_token' in appSettings.
 * The backupService filters out keys starting with 'google_' to prevent
 * refresh tokens from leaking into sync/backup exports.
 */

import { db } from '@/app/db/financeDB'

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file'

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
      console.error('[GoogleToken] Refresh failed:', res.status)
      // If refresh token is revoked / invalid, clear everything
      if (res.status === 400 || res.status === 401) {
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
 */
export async function requestGoogleAccess(): Promise<{ success: boolean; error?: string }> {
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

        resolve({ success: true })
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
