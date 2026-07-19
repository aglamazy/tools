// CALLER-KEYED ROUTE — authenticated via caller's Claude API key
import { NextRequest, NextResponse } from 'next/server'
import { extractJsonWithFallback } from '@/app/services/llm/extractionLadder'
import { withServiceCall } from 'agents-observe/next'

async function handler(req: NextRequest) {
  try {
    const { apiKey, fileBase64, mimeType } = await req.json()

    if (!fileBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: fileBase64, mimeType' },
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

    const result = await extractJsonWithFallback<Record<string, unknown>>({
      routeName: 'extract-tax-doc',
      systemPrompt,
      userParts: [
        mimeType === 'application/pdf'
          ? { type: 'document', data: fileBase64 }
          : { type: 'image', data: fileBase64, mimeType },
        { type: 'text', text: 'חלץ את הנתונים מתלוש השכר / מסמך המס הזה והחזר JSON בלבד.' },
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

export const POST = withServiceCall((req, ...args) => handler(req as NextRequest, ...args as []))
