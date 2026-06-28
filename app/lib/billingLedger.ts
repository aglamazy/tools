/**
 * billingLedger — shared helper for upserting billingStatus/{uid} (#223).
 *
 * Called by YPAY and Upay payment-callbacks when a payment link carries
 * billing metadata (billingTier, billingKind, billingMonths).
 *
 * billingStatus/{uid} is the payment SSOT:
 *   - Cockpit reads GET /api/billing/status to flip service_status/SLA
 *   - Horizontals read it to enforce quotas / feature flags
 */
import type { Firestore } from 'firebase-admin/firestore'
import type { BillingKind } from '@/app/types/billing'

/**
 * Upsert billingStatus/{ownerUserId} if the payment link has billing metadata.
 * No-op if the link lacks billingTier, billingKind, or ownerUserId.
 * Swallows errors — callers must never fail YPAY/Upay webhooks on our side.
 */
export async function upsertBillingStatus(
  firestore: Firestore,
  link: Record<string, unknown>,
  paid: boolean,
): Promise<void> {
  const uid = link.ownerUserId as string | undefined
  const tier = link.billingTier as string | undefined
  const kind = link.billingKind as BillingKind | undefined

  if (!uid || !tier || !kind) return

  try {
    const months = typeof link.billingMonths === 'number' ? link.billingMonths : 1
    const paidThrough = computePaidThrough(months)

    await firestore.collection('billingStatus').doc(uid).set({
      tier,
      kind,
      paid_through: paidThrough,
      updatedAt: new Date().toISOString(),
      lastPaymentPaid: paid,
    }, { merge: true })

    console.log('[billingLedger] upserted billingStatus for uid=%s tier=%s paid_through=%s', uid, tier, paidThrough)
  } catch (err) {
    console.error('[billingLedger] upsert failed for uid=%s:', uid, err instanceof Error ? err.message : String(err))
  }
}

function computePaidThrough(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)  // YYYY-MM-DD
}
