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

    const systemPrompt = `אתה מומחה לחילוץ נתונים מתלושי שכר ומסמכי מס ישראליים.
חלץ את השדות הבאים מהמסמך והחזר אותם כ-JSON בלבד, ללא markdown, ללא הסברים, ללא טקסט נוסף.

השדות הנדרשים:
- month: תקופת התלוש בפורמט MM/YYYY
- year: שנה (מספר)
- grossIncome: הכנסה ברוטו (מספר)
- incomeTax: ניכוי מס הכנסה (מספר)
- nationalInsurance: ביטוח לאומי (מספר)
- healthInsurance: ביטוח בריאות ממלכתי (מספר)
- netIncome: נטו לתשלום. אם לא מופיע במסמך, חשב כברוטו פחות כל הניכויים (מספר)
- employer: שם המעסיק (מחרוזת)
- annualTaxableIncome: הכנסה שנתית למס, אם קיים במסמך (מספר או null)

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              fileContent,
              {
                type: 'text',
                text: 'חלץ את הנתונים מתלוש השכר / מסמך המס הזה והחזר JSON בלבד.',
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[extract-tax-doc] Claude API error:', response.status, errorBody)
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
