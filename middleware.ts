/**
 * Saliko URL-prefix rewrite.
 *
 * The Saliko deployment serves the same Next.js app as Aglamazo, but its
 * variant-specific public pages live under `app/saliko/*` so each variant
 * can have its own marketing routes without per-page variant flags.
 * On the Saliko deployment we transparently rewrite the user-facing URLs
 * `/`, `/about`, `/pricing` etc. to their `/saliko/*` counterparts. The
 * Aglamazo deployment does nothing — `NEXT_PUBLIC_PRODUCT` defaults to
 * `aglamazo` and the early-return below kicks in.
 *
 * What's NOT rewritten (shared between products):
 *   - `/app/*`   — authenticated dashboard. Sidebar/nav filtering already
 *                  hides Aglamazo-only tabs from Saliko users.
 *   - `/api/*`   — API routes are shared infrastructure.
 *   - `/_next/*` — framework assets.
 *   - any path with a file extension (favicon, robots.txt, etc).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SHARED_PATHS = [
  '/app',
  '/api',
  '/_next',
]

function isSharedPath(pathname: string): boolean {
  if (pathname.includes('.')) return true // static asset
  return SHARED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_PRODUCT !== 'saliko') {
    return NextResponse.next()
  }

  const { pathname } = req.nextUrl

  // Already under /saliko? Leave it (handles canonical Next.js routing).
  if (pathname === '/saliko' || pathname.startsWith('/saliko/')) {
    return NextResponse.next()
  }

  // /app is the authenticated dashboard root. Aglamazo renders a finance
  // home there; Saliko has no equivalent and lands users straight on stores.
  // Rewrite (not redirect) so the URL bar still reads /app — feels like one
  // surface to the user.
  if (pathname === '/app') {
    const url = req.nextUrl.clone()
    url.pathname = '/app/stores'
    return NextResponse.rewrite(url)
  }

  if (isSharedPath(pathname)) {
    return NextResponse.next()
  }

  // Public marketing surface — rewrite to the Saliko subtree.
  const url = req.nextUrl.clone()
  url.pathname = pathname === '/' ? '/saliko' : `/saliko${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
