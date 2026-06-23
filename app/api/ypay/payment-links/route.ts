/**
 * GET /api/ypay/payment-links?businessId=<id>
 *
 * Lists the owner's YPAY payment links (#73/#213) for the income page. Reads the
 * plaintext `ypayPaymentLinks` docs written at creation + flipped by the webhook.
 * Scoped to the authenticated owner (ownerUserId); businessId narrows further.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')

  try {
    // Single equality filter — no composite index needed; sort + narrow in memory.
    const snap = await getAdminFirestore()
      .collection('ypayPaymentLinks')
      .where('ownerUserId', '==', guard.uid)
      .get()

    let links = snap.docs.map(d => d.data())
    if (businessId) links = links.filter(l => String(l.businessId) === String(businessId))
    links.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

    return NextResponse.json({ success: true, links: links.slice(0, 100) })
  } catch (err) {
    console.error('[ypay/payment-links] list failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'error', links: [] })
  }
}
