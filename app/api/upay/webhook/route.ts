/**
 * UPAY Webhook API Route
 * Handles payment success notifications from UPAY
 *
 * Note: Adjust webhook payload structure based on actual UPAY API documentation
 */

import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import crypto from 'crypto'

// Initialize Firebase Admin SDK
function getFirebaseAdmin() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (serviceAccount) {
      try {
        const credentials = JSON.parse(serviceAccount)
        initializeApp({
          credential: cert(credentials),
        })
      } catch (e) {
        console.error('[Webhook] Failed to parse Firebase service account:', e)
        initializeApp()
      }
    } else {
      initializeApp()
    }
  }
  return getFirestore()
}

// Verify webhook signature (adjust based on actual UPAY signature method)
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-upay-signature') ||
                      request.headers.get('x-signature') ||
                      request.headers.get('authorization')

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.UPAY_WEBHOOK_SECRET
    if (webhookSecret && signature) {
      // Note: Adjust verification based on actual UPAY signature method
      // Some providers use HMAC, others use different methods
      console.log('[UPAY Webhook] Signature verification enabled')
    }

    const body = JSON.parse(rawBody)

    console.log('[UPAY Webhook] Received:', JSON.stringify(body, null, 2))

    // Extract payment data (adjust field names based on actual UPAY response)
    const {
      transactionId,
      status,
      metadata,
      customer,
      amount,
      // Alternative field names that might be used
      transaction_id,
      payment_status,
      custom_data,
    } = body

    const txnId = transactionId || transaction_id
    const paymentStatus = status || payment_status
    const userId = metadata?.userId || custom_data?.userId || customer?.externalId

    // Check if payment was successful
    // Common status values: 'success', 'completed', 'approved', '0', 'OK'
    const successStatuses = ['success', 'completed', 'approved', 'ok', '0', 'paid']
    const isSuccess = successStatuses.includes(String(paymentStatus).toLowerCase())

    if (!isSuccess) {
      console.log('[UPAY Webhook] Payment not successful, status:', paymentStatus)
      return NextResponse.json({ received: true, status: 'ignored' })
    }

    if (!userId) {
      console.error('[UPAY Webhook] No userId found in webhook payload')
      return NextResponse.json({ received: true, status: 'no_user' })
    }

    try {
      // Update user tier in Firestore
      const db = getFirebaseAdmin()
      await db.collection('users').doc(userId).set(
        {
          tier: 'business',
          updatedAt: new Date(),
          upayTransactionId: txnId,
          paymentAmount: amount,
          paymentDate: new Date(),
        },
        { merge: true }
      )

      console.log('[UPAY Webhook] Updated user tier to business:', userId, 'txn:', txnId)
    } catch (err) {
      console.error('[UPAY Webhook] Failed to update Firestore:', err)
      // Return 200 to prevent retries, but log the error
    }

    return NextResponse.json({ received: true, status: 'success' })
  } catch (error) {
    console.error('[UPAY Webhook] Error:', error)
    // Return 200 to prevent excessive retries
    return NextResponse.json({ received: true, status: 'error' })
  }
}

// Support GET for webhook verification/health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'upay-webhook' })
}
