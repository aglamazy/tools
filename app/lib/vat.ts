/**
 * Israeli VAT helpers.
 *
 * Two dealer statuses (Israeli tax law):
 *   - 'exempt'     — עוסק פטור — small dealer, does not collect VAT.
 *                    Pre-payment billing doc is "חשבונית עסקה" (transaction invoice).
 *   - 'authorized' — עוסק מורשה — VAT-registered dealer, collects VAT.
 *                    Pre-payment billing doc is "חשבונית מס" (tax invoice) with
 *                    VAT line at the current statutory rate.
 *
 * The VAT registration number (מספר עוסק) is stamped onto the document by YPAY
 * (the document generator). Each dealer's YPAY account is keyed to their own
 * registration, so we don't store it on the owner record.
 */

export type VatType = 'exempt' | 'authorized'

/**
 * Statutory Israeli VAT rate history (אחוז המע״מ).
 *
 * Each entry's `from` is the first day the rate applied (YYYY-MM-DD).
 * Use `getVatRateForDate` to resolve a rate for a transaction/document date —
 * a single const can't model this because historical reports span multiple rates.
 *
 * Source: Israel Tax Authority.
 *   2013-06-02 → 2015-09-30: 18%
 *   2015-10-01 → 2024-12-31: 17%
 *   2025-01-01 → present:     18%
 */
export const VAT_RATE_HISTORY: readonly { from: string; rate: number }[] = [
  { from: '2013-06-02', rate: 0.18 },
  { from: '2015-10-01', rate: 0.17 },
  { from: '2025-01-01', rate: 0.18 },
]

/** Resolve the statutory VAT rate effective on the given date. */
export function getVatRateForDate(date: Date | string): number {
  const iso = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10)
  let rate = VAT_RATE_HISTORY[0].rate
  for (const entry of VAT_RATE_HISTORY) {
    if (entry.from <= iso) rate = entry.rate
    else break
  }
  return rate
}

/** Multiplier to extract VAT from a VAT-inclusive (gross) amount: `gross × factor = vat`. */
export function vatInclusiveFactor(rate: number): number {
  return rate / (1 + rate)
}

/**
 * Current statutory VAT rate (resolved at module load).
 * Used by the new-invoice / settlement flows where "today's rate" is what we
 * stamp onto a freshly-issued document. Historical reports must use
 * `getVatRateForDate` instead.
 */
export const VAT_RATE_AUTHORIZED_DEALER = getVatRateForDate(new Date())

/** Hebrew label for the pre-payment billing doc that matches the dealer status. */
export function billingDocLabel(vatType: VatType | undefined): string {
  return vatType === 'authorized' ? 'חשבונית מס' : 'חשבונית עסקה'
}
