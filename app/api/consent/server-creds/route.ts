/**
 * Tier-3 server-credentials consent API.
 *
 * POST   → grant consent (records current policy version on `users/{uid}`)
 * DELETE → revoke consent AND wipe every server-side encrypted cred copy for
 *          this user (Shufersal `private/credentials` + each
 *          `stores/{storeId}/private/credentials`). Dexie copies in the
 *          user's browser are untouched.
 *
 * See `app/services/consentService.ts` for the storage shape and
 * `app/saliko/privacy/privacyContent.ts` for the policy this gate enforces.
 *
 * Saliko-only — Aglamazo doesn't act on the user's behalf and doesn't need
 * the gate. Returns 404 off-variant so it can't be accidentally invoked.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { VARIANT } from '@/app/config/variants'
import {
  grantServerCredsConsent,
  revokeServerCredsConsent,
  getServerCredsConsent,
} from '@/app/services/consentService'

function variantGate(): NextResponse | null {
  if (VARIANT !== 'saliko') {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  return null
}

export async function GET(request: NextRequest) {
  const gate = variantGate(); if (gate) return gate
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  const consent = await getServerCredsConsent(guard.uid)
  return NextResponse.json({ success: true, consent })
}

export async function POST(request: NextRequest) {
  const gate = variantGate(); if (gate) return gate
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  try {
    const consent = await grantServerCredsConsent(guard.uid)
    return NextResponse.json({ success: true, consent })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Consent API] grant failed:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const gate = variantGate(); if (gate) return gate
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  try {
    const result = await revokeServerCredsConsent(guard.uid)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Consent API] revoke failed:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
