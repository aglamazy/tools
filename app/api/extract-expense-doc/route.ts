// CALLER-KEYED ROUTE — authenticated via caller's Claude API key
import { NextRequest, NextResponse } from 'next/server'
import { extractJsonWithFallback } from '@/app/services/llm/extractionLadder'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(req: NextRequest) {
  try {
    const { apiKey, fileBase64, mimeType } = await req.json()

    if (!fileBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: fileBase64, mimeType' },
        { status: 400 },
      )
    }

    const systemPrompt = `אתה מומחה לחילוץ נתונים מקבלות וחשבוניות ישראליות.
חלץ את השדות הבאים מהמסמך והחזר אותם כ-JSON בלבד, ללא markdown, ללא הסברים, ללא טקסט נוסף.

השדות הנדרשים:
- vendor: שם העסק / ספק (מחרוזת)
- date: תאריך המסמך בפורמט DD/MM/YYYY
- amount: סכום כולל לתשלום (מספר)
- vatAmount: סכום מע״מ אם מופיע (מספר או null)
- description: תיאור השירות או הפריטים שנרכשו בפועל, מתוך שורות הפירוט של המסמך (למשל "מנוי Pro", "אירוח אתרים", "ייעוץ"). אל תחזיר את כותרת/סוג המסמך ("Invoice" / "חשבונית" / "קבלה" / "Receipt") — לכך יש שדה docType. אם אין שורת פירוט ברורה, החזר את שם המוצר/השירות הכללי, ולעולם לא את המילה "חשבונית"/"Invoice" (מחרוזת)
- invoiceNumber: מספר חשבונית / קבלה אם קיים (מחרוזת או null)
- externalTxRef: מזהה העסקה / המסמך של הספק עצמו אם קיים (מחרוזת או null)
- referenceNumber: מספר אסמכתא / reference של חברת האשראי או המעבד אם קיים (מחרוזת או null)
- docType: אחד מהערכים "invoice" | "receipt" | "receipt-invoice" | "unknown"; אם אינך בטוח בסיווג, החזר "unknown"; אם השדה לא רלוונטי כלל, החזר null
- paymentMethod: אמצעי תשלום אם מצוין - מזומן, אשראי, העברה בנקאית וכו׳ (מחרוזת או null)

החזר אך ורק JSON תקין. אל תעטוף בבלוק קוד. אל תוסיף טקסט לפני או אחרי ה-JSON.`

    const result = await extractJsonWithFallback<Record<string, unknown>>({
      routeName: 'extract-expense-doc',
      systemPrompt,
      userParts: [
        mimeType === 'application/pdf'
          ? { type: 'document', data: fileBase64 }
          : { type: 'image', data: fileBase64, mimeType },
        { type: 'text', text: 'חלץ את הנתונים מהקבלה / חשבונית הזו והחזר JSON בלבד.' },
      ],
      anthropicApiKey: apiKey,
      geminiModel: 'gemini-2.5-flash',
      geminiMaxTokens: 1024,
      anthropicModel: 'claude-sonnet-5',
      anthropicMaxTokens: 1024,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          provider: result.provider,
          providerError: result.providerError ?? true,
          details: result.details,
          raw: result.raw,
        },
        { status: result.status ?? 502 },
      )
    }

    return NextResponse.json(result.data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 },
    )
  }
}

export const POST = withServiceCall(POSTHandler)
