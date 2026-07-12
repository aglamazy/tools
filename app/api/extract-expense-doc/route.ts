// CALLER-KEYED ROUTE — authenticated via caller's Claude API key
import { NextRequest, NextResponse } from 'next/server'
import { parseClaudeJson } from '@/app/utils/parseClaudeJson'

export async function POST(req: NextRequest) {
  try {
    const { apiKey, fileBase64, mimeType } = await req.json()

    if (!apiKey || !fileBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: apiKey, fileBase64, mimeType' },
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

    // Build the content block based on file type
    const isPdf = mimeType === 'application/pdf'
    const fileContent = isPdf
      ? {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: fileBase64,
          },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: fileBase64,
          },
        }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              fileContent,
              {
                type: 'text',
                text: 'חלץ את הנתונים מהקבלה / חשבונית הזו והחזר JSON בלבד.',
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[extract-expense-doc] Claude API error:', response.status, errorBody)
      return NextResponse.json(
        { error: `Claude API error: ${response.status}`, details: errorBody },
        { status: response.status },
      )
    }

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''

    try {
      const parsed = parseClaudeJson(text)
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse Claude response as JSON', raw: text },
        { status: 502 },
      )
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 },
    )
  }
}
