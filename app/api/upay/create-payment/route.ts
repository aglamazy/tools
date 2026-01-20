/**
 * UPAY Create Payment API Route
 * Creates a payment session for upgrading to Business tier
 *
 * UPAY Documentation: Provided after API purchase from https://app.upay.co.il/
 *
 * Note: This implementation follows common Israeli payment gateway patterns.
 * Adjust endpoints and payload structure based on actual UPAY API documentation.
 */

import { NextRequest, NextResponse } from 'next/server'

type UpayConfig = {
  apiKey: string
  apiSecret: string
  terminalId: string
  baseUrl: string
}

function getConfig(): UpayConfig | null {
  const apiKey = process.env.UPAY_API_KEY
  const apiSecret = process.env.UPAY_API_SECRET
  const terminalId = process.env.UPAY_TERMINAL_ID

  if (!apiKey || !apiSecret || !terminalId) return null

  const isSandbox = process.env.UPAY_SANDBOX === 'true'
  const baseUrl = isSandbox
    ? (process.env.UPAY_SANDBOX_URL || 'https://sandbox.upay.co.il/api')
    : (process.env.UPAY_API_URL || 'https://api.upay.co.il/api')

  return {
    apiKey,
    apiSecret,
    terminalId,
    baseUrl,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, userEmail } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const config = getConfig()
    if (!config) {
      console.error('[UPAY] API credentials not configured')
      return NextResponse.json(
        { error: 'Payment system not configured' },
        { status: 500 }
      )
    }

    const priceAmount = parseInt(process.env.UPAY_PRICE_AMOUNT || '99', 10)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Create payment request
    // Note: Adjust this payload based on actual UPAY API documentation
    const response = await fetch(`${config.baseUrl}/payments/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Terminal-Id': config.terminalId,
      },
      body: JSON.stringify({
        // Transaction details
        amount: priceAmount * 100, // Amount in agorot (cents)
        currency: 'ILS',
        description: 'שדרוג לחבילת Business - ארגז כלים פיננסיים',

        // Customer details
        customer: {
          email: userEmail,
          externalId: userId,
        },

        // Payment settings
        paymentType: 'regular', // regular, installments, etc.
        maxPayments: 1,

        // Callback URLs
        successUrl: `${baseUrl}/tools/settings?upgrade=success&txn={transactionId}`,
        cancelUrl: `${baseUrl}/tools/settings?upgrade=cancelled`,
        notifyUrl: `${baseUrl}/api/upay/webhook`,

        // Custom data for webhook
        metadata: {
          userId,
          product: 'business-tier',
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[UPAY] Create payment failed:', response.status, errorData)
      return NextResponse.json(
        { error: errorData.message || 'Failed to create payment' },
        { status: 500 }
      )
    }

    const data = await response.json()

    console.log('[UPAY] Created payment:', data.transactionId, 'for user:', userId)

    return NextResponse.json({
      url: data.paymentUrl || data.url,
      transactionId: data.transactionId || data.id,
    })
  } catch (error) {
    console.error('[UPAY] Create payment error:', error)
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    )
  }
}
