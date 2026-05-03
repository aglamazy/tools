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

/** Israeli VAT rate for עוסק מורשה (authorized dealer). */
export const VAT_RATE_AUTHORIZED_DEALER = 0.18

/** Hebrew label for the pre-payment billing doc that matches the dealer status. */
export function billingDocLabel(vatType: VatType | undefined): string {
  return vatType === 'authorized' ? 'חשבונית מס' : 'חשבונית עסקה'
}
