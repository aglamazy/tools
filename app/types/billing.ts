/**
 * Billing status contract — matches agents-billing PaymentStatus shape.
 * This is the Aglamazo-side SSOT; cockpit reads /api/billing/status to flip
 * SLA flags; horizontals read it to set quotas.
 */

export type BillingKind = 'one_time' | 'recurring'

export type BillingStatus = {
  tier: string
  kind: BillingKind
  paid_through: string  // ISO date (YYYY-MM-DD); the day coverage expires
  updatedAt: string     // ISO timestamp of last upsert
}

/** Full map returned by GET /api/billing/status: uid → billing state */
export type BillingStatusMap = Record<string, BillingStatus>

/**
 * Optional billing metadata stored on a payment link when it is created
 * for a subscription/billing charge (vs. a generic client invoice).
 * When present, the payment-callback upserts billingStatus on success.
 */
export type PaymentLinkBillingMeta = {
  billingTier: string
  billingKind: BillingKind
  billingMonths?: number  // defaults to 1 when absent
}
