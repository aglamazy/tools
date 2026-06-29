// CALLER-KEYED ROUTE — public YPAY webhook, validated by a shared secret query param
/**
 * POST /api/ypay/payment-callback?cid=<chargeIdentifier>&k=<secret>
 *
 * YPAY's Credit-Clearing `notifyUrl` target (#73). After a payment attempt YPAY
 * POSTs the transaction result here (per API doc v1.9 p.12 "Transaction Information"):
 *   { success: 'true'|'false', transactionId, url, sum, document_id, document_type }
 *
 * Stores the raw payload exactly as received to Firestore `ypayPaymentEvents` to
 * wire the payment into the income line. Body may arrive as JSON or form-encoded —
 * stored as-is under `raw`.
 *
 * Auth: `k` must equal YPAY_WEBHOOK_SECRET (server-only env). If the env is unset
 * (local dev) we still store the event but flag it `verified: false`.
 *
 * Billing ledger: if the payment link carries billingTier/billingKind metadata,
 * a successful payment also upserts billingStatus/{ownerUserId} (#223).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { upsertBillingStatus } from '@/app/lib/billingLedger'

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
    // Unknown content-type: try json, fall back to raw text.
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

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const { searchParams } = url
  const cid = searchParams.get('cid') || ''
  const k = searchParams.get('k') || ''

  const expected = process.env.YPAY_WEBHOOK_SECRET?.trim()
  const verified = !!expected && k === expected

  const raw = await parseBody(request)

  try {
    const firestore = getAdminFirestore()
    await firestore.collection('ypayPaymentEvents').add({
      chargeIdentifier: cid || null,
      verified,
      raw,
      receivedAt: new Date().toISOString(),
    })

    // Reconcile the link the income page + branded /pay page read. Idempotent —
    // a duplicate notify just re-stamps the same terminal status. Per spec p.12
    // the payload carries success/transactionId/url/sum/document_id/document_type.
    if (cid && raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>
      const ok = String(r.success).toLowerCase() === 'true'
      await firestore.collection('ypayPaymentLinks').doc(cid).set({
        status: ok ? 'paid' : 'failed',
        paidAt: ok ? new Date().toISOString() : null,
        ...(r.transactionId !== undefined ? { transactionId: String(r.transactionId) } : {}),
        ...(r.url ? { receiptUrl: String(r.url) } : {}),
        ...(r.document_id !== undefined ? { serialNumber: String(r.document_id) } : {}),
      }, { merge: true })

      // Billing ledger upsert (#223): if the link carries billingTier/billingKind
      // metadata, propagate the payment outcome to billingStatus/{ownerUserId}.
      if (ok) {
        const linkDoc = await firestore.collection('ypayPaymentLinks').doc(cid).get()
        const link = linkDoc.data() || {}
        await upsertBillingStatus(firestore, link, ok)
      }
    }
  } catch (err) {
    // Never fail YPAY's callback on our storage hiccup — log + 200 so it doesn't retry-storm.
    console.error('[ypay/payment-callback] store failed:', err instanceof Error ? err.message : String(err), 'cid=', cid)
  }

  // YPAY only needs a 200 to consider the notify delivered.
  return NextResponse.json({ ok: true })
}
