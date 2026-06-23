// CALLER-KEYED ROUTE — authenticated via caller's YPAY credentials
import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

const BASE_URL = 'https://ypay.co.il/api/v1'

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`שגיאה ${response.status}: ${text}`)
  }

  const data = await response.json()
  if (!data.access_token) {
    throw new Error(data.error || 'תגובה לא צפויה')
  }

  return data.access_token
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, clientId, clientSecret } = body

    if (!clientId || !clientSecret) {
      return NextResponse.json({ success: false, message: 'חסרים פרטי התחברות' })
    }

    // Default action: test connection (backward compatible)
    if (!action || action === 'testConnection') {
      try {
        await getAccessToken(clientId, clientSecret)
        return NextResponse.json({ success: true, message: 'התחברות הצליחה' })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message })
      }
    }

    // Create document action
    if (action === 'createDocument') {
      const { docType, items, methods, contact } = body

      if (!docType || !items) {
        return NextResponse.json({ success: false, message: 'חסרים פרטי מסמך' })
      }

      const accessToken = await getAccessToken(clientId, clientSecret)

      const docResponse = await fetch(`${BASE_URL}/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          docType,
          items,
          ...(methods ? { methods } : {}),
          ...(contact ? { contact } : {}),
        }),
      })

      if (!docResponse.ok) {
        const text = await docResponse.text()
        return NextResponse.json({ success: false, message: `שגיאה ביצירת מסמך: ${text}` })
      }

      const docData = await docResponse.json()

      if (docData.responseCode && docData.responseCode >= 2000) {
        return NextResponse.json({ success: false, message: docData.message || 'שגיאה ביצירת מסמך' })
      }

      return NextResponse.json({
        success: true,
        url: docData.url,
        serialNumber: docData.serialNumber || docData.serial_number,
        responseCode: docData.responseCode,
      })
    }

    // Create credit-clearing payment page (#73). Returns a YPAY-hosted payment
    // page URL for the exact items we send — shareable link / iFrame. On a
    // successful charge YPAY generates the receipt (docType 108/109), emails it
    // (mail:true), and POSTs the result to notifyUrl (our payment-callback).
    if (action === 'createPayment') {
      const {
        items, contact, chargeIdentifier, docType,
        payments, mail, lang, currency, appOrigin,
        businessId, businessName, ownerUserId, amount,
      } = body

      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ success: false, message: 'חסרים פריטים לתשלום' })
      }
      if (!chargeIdentifier) {
        return NextResponse.json({ success: false, message: 'חסר מזהה עסקה (chargeIdentifier)' })
      }

      // Build callback URLs server-side so the webhook secret never reaches the
      // client. `appOrigin` is the browser's window.location.origin (correct
      // public origin on both localhost and prod); the secret comes from env.
      const origin = (typeof appOrigin === 'string' && appOrigin) ? appOrigin.replace(/\/+$/, '') : ''
      const secret = process.env.YPAY_WEBHOOK_SECRET?.trim() || ''
      const cidEnc = encodeURIComponent(chargeIdentifier)
      const notifyUrl = origin
        ? `${origin}/api/ypay/payment-callback?cid=${cidEnc}${secret ? `&k=${encodeURIComponent(secret)}` : ''}`
        : undefined
      // Branded public success/failure pages (rendered inside our iframe wrapper
      // when YPAY redirects on completion). Public routes — the payer is anon.
      const successUrl = origin ? `${origin}/pay/success?cid=${cidEnc}` : undefined
      const failureUrl = origin ? `${origin}/pay/failure?cid=${cidEnc}` : undefined

      const accessToken = await getAccessToken(clientId, clientSecret)

      const payResponse = await fetch(`${BASE_URL}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          chargeIdentifier,
          items,
          ...(contact ? { contact } : {}),
          ...(docType !== undefined ? { docType } : {}),
          ...(payments !== undefined ? { payments } : {}),
          ...(mail !== undefined ? { mail } : {}),
          lang: lang || 'he',
          currency: currency || 'ILS',
          ...(notifyUrl ? { notifyUrl } : {}),
          ...(successUrl ? { successUrl } : {}),
          ...(failureUrl ? { failureUrl } : {}),
        }),
      })

      if (!payResponse.ok) {
        const text = await payResponse.text()
        return NextResponse.json({ success: false, message: `שגיאה ביצירת דף תשלום: ${text}` })
      }

      const payData = await payResponse.json()
      if (payData.responseCode && payData.responseCode >= 2000) {
        return NextResponse.json({ success: false, message: payData.message || 'שגיאה ביצירת דף תשלום' })
      }

      // Persist the clearance info to a plaintext, server-readable doc keyed by
      // chargeIdentifier. This is what our branded /pay/[cid] page reads (the
      // payer is anon on another device — they can't see the owner's Dexie/backup)
      // and what the income page lists. The webhook flips `status` on payment.
      try {
        await getAdminFirestore().collection('ypayPaymentLinks').doc(chargeIdentifier).set({
          chargeIdentifier,
          businessId: businessId ?? null,
          businessName: businessName ?? null,
          ownerUserId: ownerUserId ?? null,
          docType: docType ?? null,
          amount: typeof amount === 'number' ? amount : null,
          currency: currency || 'ILS',
          items: Array.isArray(items) ? items : [],
          contact: contact ?? null,
          paymentUrl: payData.url,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })
      } catch (err) {
        // Don't fail link creation on a persistence hiccup — the YPAY url still
        // works; we just won't have it listed / wrapped. Log loudly.
        console.error('[ypay/createPayment] persist ypayPaymentLinks failed:', err instanceof Error ? err.message : String(err), 'cid=', chargeIdentifier)
      }

      return NextResponse.json({
        success: true,
        url: payData.url,
        responseCode: payData.responseCode,
      })
    }

    // List documents action
    if (action === 'listDocuments') {
      const accessToken = await getAccessToken(clientId, clientSecret)

      const listResponse = await fetch(`${BASE_URL}/payment/getTransactionsInfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ transactionIds: Array.from({ length: 100 }, (_, i) => i + 1) }),
      })

      const text = await listResponse.text()
      let listData: any
      try {
        listData = JSON.parse(text)
      } catch {
        return NextResponse.json({ success: false, message: `YPAY לא החזיר תגובה תקינה` })
      }

      if (!listResponse.ok) {
        return NextResponse.json({ success: false, message: listData.message || `שגיאה ${listResponse.status}` })
      }

      // Response format: { success, documents: { transactionsInfo: [...], responseCode } }
      const transactionsInfo = listData.documents?.transactionsInfo || []
      const documents = Array.isArray(transactionsInfo)
        ? transactionsInfo
            .filter((t: any) => t.documentUrl || t.url)
            .map((t: any) => ({
              serial_number: t.serialNumber || t.serial_number || t.documentId || '',
              url: t.documentUrl || t.url || '',
              docType: t.documentType || t.docType,
            }))
        : []

      return NextResponse.json({ success: true, documents })
    }

    return NextResponse.json({ success: false, message: 'פעולה לא מוכרת' })
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'שגיאת שרת' })
  }
}
