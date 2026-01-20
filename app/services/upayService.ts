/**
 * UPAY Service
 * Client-side helpers for UPAY payment clearing (סליקה) integration
 * https://app.upay.co.il/
 */

export type PaymentResult = {
  url?: string
  transactionId?: string
  error?: string
}

/**
 * Create a UPAY payment session
 * Calls the API route to create a payment and returns the payment page URL
 */
export async function createPayment(
  userId: string,
  userEmail?: string
): Promise<PaymentResult> {
  try {
    const response = await fetch('/api/upay/create-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        userEmail,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[UPAY] Payment error:', data.error)
      return { error: data.error || 'Failed to create payment' }
    }

    return { url: data.url, transactionId: data.transactionId }
  } catch (err) {
    console.error('[UPAY] Network error:', err)
    return { error: 'Network error' }
  }
}
