// PUBLIC ROUTE — OAuth code exchange endpoint
import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/**
 * POST /api/auth/google-token
 *
 * Two modes:
 * 1. { code, redirectUri } — exchange authorization code for tokens
 * 2. { refreshToken }      — refresh an expired access token
 */
export async function POST(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth credentials not configured on server' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()

    // Mode 1: Exchange authorization code
    if (body.code && body.redirectUri) {
      const params = new URLSearchParams({
        code: body.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: body.redirectUri,
        grant_type: 'authorization_code',
      })

      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('[google-token] Code exchange failed:', data)
        return NextResponse.json(
          { error: data.error_description || data.error || 'Token exchange failed' },
          { status: response.status }
        )
      }

      return NextResponse.json({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        // id_token is included when the OAuth scope set contains `openid`; the
        // client uses it to sign in to Firebase via signInWithCredential, so a
        // single popup grants both Firebase auth AND Gmail/Drive/Calendar tokens.
        idToken: data.id_token,
      })
    }

    // Mode 2: Refresh access token
    if (body.refreshToken) {
      const params = new URLSearchParams({
        refresh_token: body.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      })

      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('[google-token] Refresh failed:', data)
        // Surface Google's structured error code so the client can distinguish
        // a permanent failure (`invalid_grant` — refresh token revoked) from
        // transient ones (rate limits, 5xx, network blips).
        return NextResponse.json(
          {
            error: data.error_description || data.error || 'Token refresh failed',
            errorCode: data.error || null,
          },
          { status: response.status }
        )
      }

      return NextResponse.json({
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      })
    }

    return NextResponse.json(
      { error: 'Request must include either { code, redirectUri } or { refreshToken }' },
      { status: 400 }
    )
  } catch (err: any) {
    console.error('[google-token] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
