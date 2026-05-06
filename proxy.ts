/**
 * Next.js 16 proxy — two responsibilities:
 *
 * 1. **API auth** (always-on): Firebase JWT signature verification using Web
 *    Crypto API for `/api/admin/*`, `/api/household/*`, `/api/profile-qa`.
 *    See docs/SECURITY.md for the full policy.
 *
 * 2. **Saliko URL prefix** (saliko deployment only): on the variant
 *    deployment, transparently rewrite public marketing URLs (`/`, `/about`,
 *    etc.) to their `app/saliko/*` counterparts so Saliko keeps its own
 *    route subtree without per-page variant flags. Rewrites `/app` to
 *    `/app/stores` so Saliko users hitting the dashboard root land on
 *    their actual home (Aglamazo's `/app` shows finance, irrelevant here).
 *    On Aglamazo, the env check below short-circuits and the proxy is a
 *    no-op for non-API paths.
 */

import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'aglamaz-finance'
const EXPECTED_ISS = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/metadata/jwk/securetoken@system.gserviceaccount.com'

// Tier ranking for comparisons
const TIER_RANK: Record<string, number> = { free: 1, home: 2, pro: 3, owner: 4 }

// T&C version fallback (keep in sync with app/config.ts)
const TC_VERSION_FALLBACK = '2026-03-09'

export const config = {
  matcher: [
    // API auth (existing, always-on regardless of variant)
    '/api/admin/:path*',
    '/api/household/:path*',
    '/api/profile-qa',
    // Saliko URL rewrites — covers all non-API paths. The proxy function
    // early-returns when NEXT_PUBLIC_PRODUCT !== 'saliko' so Aglamazo just
    // sees one extra no-op function call per request.
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}

// ---------------------------------------------------------------------------
// JWK cache
// ---------------------------------------------------------------------------

type JWK = JsonWebKey & { kid: string }

let cachedKeys: JWK[] = []
let cacheExpiresAt = 0

async function getPublicKeys(): Promise<JWK[]> {
  if (cachedKeys.length > 0 && Date.now() < cacheExpiresAt) {
    return cachedKeys
  }

  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error(`Failed to fetch Firebase JWKs: ${res.status}`)

  // Parse max-age from Cache-Control header
  const cacheControl = res.headers.get('Cache-Control') || ''
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/)
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600

  const data = (await res.json()) as { keys: JWK[] }
  cachedKeys = data.keys
  cacheExpiresAt = Date.now() + maxAge * 1000

  return cachedKeys
}

// ---------------------------------------------------------------------------
// JWT helpers (Edge-compatible, no libraries)
// ---------------------------------------------------------------------------

function base64urlDecode(str: string): Uint8Array {
  // Convert base64url to base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4 !== 0) b64 += '='
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

interface TokenPayload {
  iss: string
  aud: string
  sub: string
  exp: number
  iat: number
  auth_time: number
  // Custom claims
  tier?: string
  tcAcceptedAt?: string
  householdId?: string
  householdRole?: string
  [key: string]: unknown
}

async function verifyFirebaseToken(token: string): Promise<TokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, signatureB64] = parts

  // Decode header
  let header: { alg: string; kid: string }
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)))
  } catch {
    return null
  }

  if (header.alg !== 'RS256' || !header.kid) return null

  // Find matching key
  let keys = await getPublicKeys()
  let jwk = keys.find((k) => k.kid === header.kid)

  if (!jwk) {
    // Key may have rotated — force refresh
    cacheExpiresAt = 0
    keys = await getPublicKeys()
    jwk = keys.find((k) => k.kid === header.kid)
    if (!jwk) return null
  }

  // Import public key
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )

  // Verify signature
  const signatureBytes = base64urlDecode(signatureB64)
  const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signatureBytes.buffer as ArrayBuffer,
    dataBytes.buffer as ArrayBuffer,
  )
  if (!isValid) return null

  // Decode payload
  let payload: TokenPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)))
  } catch {
    return null
  }

  // Validate standard claims
  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== EXPECTED_ISS) return null
  if (payload.aud !== FIREBASE_PROJECT_ID) return null
  if (payload.exp <= now) return null
  if (payload.iat > now + 60) return null // small clock skew tolerance
  if (!payload.sub) return null

  return payload
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

function deny(message: string, status: 401 | 403) {
  return NextResponse.json({ success: false, error: message }, { status })
}

const SALIKO_SHARED_PATHS = ['/app', '/api', '/_next']

function isSalikoSharedPath(pathname: string): boolean {
  if (pathname.includes('.')) return true // static asset
  return SALIKO_SHARED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function salikoRewrite(request: NextRequest): NextResponse {
  if (process.env.NEXT_PUBLIC_PRODUCT !== 'saliko') {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

  // Already under /saliko? Leave it (handles canonical Next.js routing).
  if (pathname === '/saliko' || pathname.startsWith('/saliko/')) {
    return NextResponse.next()
  }

  // /app is the authenticated dashboard root. Aglamazo renders a finance
  // home there; Saliko has no equivalent and lands users straight on stores.
  // Rewrite (not redirect) so the URL bar still reads /app — feels like one
  // surface to the user.
  if (pathname === '/app') {
    const url = request.nextUrl.clone()
    url.pathname = '/app/stores'
    return NextResponse.rewrite(url)
  }

  if (isSalikoSharedPath(pathname)) {
    return NextResponse.next()
  }

  // Public marketing surface — rewrite to the Saliko subtree.
  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? '/saliko' : `/saliko${pathname}`
  return NextResponse.rewrite(url)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Non-API paths skip JWT entirely and only run through the Saliko rewrite
  // (which itself short-circuits on the Aglamazo deployment).
  if (!pathname.startsWith('/api/')) {
    return salikoRewrite(request)
  }

  // --- API auth path (Firebase JWT verification) ---
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return deny('Unauthorized', 401)
  }

  const token = authHeader.slice(7)
  let payload: TokenPayload | null

  try {
    payload = await verifyFirebaseToken(token)
  } catch {
    return deny('Token verification failed', 401)
  }

  if (!payload) {
    return deny('Invalid token', 401)
  }

  // --- /api/admin/* — require owner tier ---
  if (pathname.startsWith('/api/admin')) {
    const tier = payload.tier || 'free'
    if ((TIER_RANK[tier] || 0) < TIER_RANK['owner']) {
      return deny('Insufficient permissions', 403)
    }
    return NextResponse.next()
  }

  // --- /api/household/*, /api/profile-qa — require T&C accepted ---
  if (pathname.startsWith('/api/household') || pathname === '/api/profile-qa') {
    const tcAcceptedAt = payload.tcAcceptedAt
    if (!tcAcceptedAt || tcAcceptedAt < TC_VERSION_FALLBACK) {
      return deny('Terms not accepted', 403)
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}
