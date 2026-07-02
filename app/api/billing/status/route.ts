// CALLER-KEYED ROUTE — shared read token, NOT public (exposes who-paid)
/**
 * GET /api/billing/status
 *
 * Machine-to-machine endpoint returning the full billingStatus map
 * (uid → {tier, kind, paid_through, updatedAt}). Callers:
 *   - Cockpit reconcile: reads to set service_status / SLA per customer
 *   - Horizontals (AH, Saliko, …): read to set quota / feature flags
 *
 * Auth: Authorization: Bearer <BILLING_READ_TOKEN>
 * This is a server-side shared token (Vercel sensitive env var), not a
 * Firebase ID token — callers are services, not user sessions.
 *
 * Precedent: /api/ypay/payment-links (read guard pattern), but token-based
 * instead of Firebase ID token because callers are machine peers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { VARIANT, VARIANT_CONFIG } from '@/app/config/variants'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import type { BillingStatus, BillingStatusMap } from '@/app/types/billing'

export const runtime = 'nodejs'

function checkReadToken(request: NextRequest): boolean {
  const expected = process.env.BILLING_READ_TOKEN?.trim()
  if (!expected) return false  // unconfigured = deny
  const header = request.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return token === expected
}

export async function GET(request: NextRequest) {
  if (!checkReadToken(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (VARIANT === 'saliko' && VARIANT_CONFIG.serviceStatus) {
      await getAdminFirestore().collection('billingStatus').doc('saliko').set({
        tier: 'saliko',
        kind: 'recurring',
        paid_through: '2099-12-31',
        service_status: VARIANT_CONFIG.serviceStatus,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    }

    const snap = await getAdminFirestore().collection('billingStatus').get()

    const status: BillingStatusMap = {}
    for (const doc of snap.docs) {
      status[doc.id] = doc.data() as BillingStatus
    }

    return NextResponse.json({ success: true, status })
  } catch (err) {
    console.error('[billing/status] read failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
