/**
 * Fires the next hop of the Telegram self-chaining checkout driver (#275) —
 * see app/api/grocery/checkout/continue/route.ts for why this needs to be a
 * genuinely separate serverless invocation rather than a loop inside one call.
 */

const CRON_SECRET = process.env.CRON_SECRET
const APP_URL = process.env.NEXT_PUBLIC_APP_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3100')

export interface CheckoutContinueBody {
  uid: string
  checkoutId: string
  telegramChatId: number
  batchIndex: number
}

/** Fire the next step without blocking the caller's own response. */
export function fireNextCheckoutStep(body: CheckoutContinueBody): void {
  fetch(`${APP_URL}/api/grocery/checkout/continue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    },
    body: JSON.stringify(body),
  }).catch(err => console.error('[CheckoutContinue] fireNextCheckoutStep failed:', err))
}
