// CALLER-KEYED ROUTE — Upay webhook, validated by a shared secret query param
/**
 * POST /api/upay/payment-callback?cid=<chargeIdentifier>&k=<secret>
 *
 * Upay payment gateway webhook (#223 — sibling to YPAY). Mirrors the YPAY
 * callback pattern: store the raw event, reconcile the payment link status,
 * and upsert billingStatus when billing metadata is present.
 *
 * Payload shape may vary by gateway version; we store `raw` as-is and treat
 * `success: 'true'|'false'` (or boolean) as the outcome signal.
 *
 * Auth: `k` must equal UPAY_WEBHOOK_SECRET (server-only env, Vercel sensitive).
 * If unset (local dev), events are stored flagged `verified: false`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { upsertBillingStatus } from '@/app/lib/billingLedger'
import { withServiceCall } from '@/app/lib/observe'

export const runtime = 'nodejs'

async function parseBody(request: NextRequest): Promise<unknown> {
  const ct = request.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) {
      return await request.json()
    }
    if (ct.includes('form')) {
      const fd = await request.formData()
      return Object.fromEntries(Array.from(fd.entries()))
    }
    const text = await request.text()
    try {
      return JSON.parse(text)
    } catch {
      return { _rawText: text }
    }
  } catch (err) {
    return { _parseError: err instanceof Error ? err.message : String(err) }
  }
}

async function POSTHandler(request: NextRequest) {
  const url = new URL(request.url)
  const { searchParams } = url
  const cid = searchParams.get('cid') || ''
  const k = searchParams.get('k') || ''

  const expected = process.env.UPAY_WEBHOOK_SECRET?.trim()
  const verified = !!expected && k === expected

  const raw = await parseBody(request)

  // SMOKE-TEST: capture EVERYTHING the sender posted (see ypay callback). ⚠️ url
  // + query carry &k=<secret> — rotate + strip after the smoke test. (Re-added
  // after the Hopper prematurely stripped it via #1995.)
  const requestDump = {
    method: request.method,
    url: request.url,
    path: url.pathname,
    query: Object.fromEntries(searchParams.entries()),
    headers: Object.fromEntries(request.headers.entries()),
    contentType: request.headers.get('content-type') || null,
  }

  try {
    const firestore = getAdminFirestore()
    await firestore.collection('upayPaymentEvents').add({
      chargeIdentifier: cid || null,
      verified,
      request: requestDump,
      raw,
      receivedAt: new Date().toISOString(),
    })

    if (cid && raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>
      // Accept both string 'true'/'false' and boolean true/false from gateway
      const ok = r.success === true || String(r.success).toLowerCase() === 'true'

      await firestore.collection('upayPaymentLinks').doc(cid).set({
        status: ok ? 'paid' : 'failed',
        paidAt: ok ? new Date().toISOString() : null,
        ...(r.transactionId !== undefined ? { transactionId: String(r.transactionId) } : {}),
        ...(r.url ? { receiptUrl: String(r.url) } : {}),
        ...(r.document_id !== undefined ? { serialNumber: String(r.document_id) } : {}),
      }, { merge: true })

      // Billing ledger upsert: if link carries billingTier/billingKind, propagate
      // the payment outcome to billingStatus/{ownerUserId}.
      if (ok) {
        const linkDoc = await firestore.collection('upayPaymentLinks').doc(cid).get()
        const link = linkDoc.data() || {}
        await upsertBillingStatus(firestore, link, ok)
      }
    }
  } catch (err) {
    // Never fail the gateway callback on our storage hiccup.
    console.error('[upay/payment-callback] store failed:', err instanceof Error ? err.message : String(err), 'cid=', cid)
  }

  return NextResponse.json({ ok: true })
}

export const POST = withServiceCall(POSTHandler)
