// CALLER-KEYED ROUTE — authenticated via caller's YPAY credentials
import { NextRequest, NextResponse } from 'next/server'

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
