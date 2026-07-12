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

    const systemPrompt = `אתה מומחה לחילוץ נתונים מהודעות מקדמות של ביטוח לאומי (בל"ל) בישראל.
חלץ מהמסמך את לוח התשלומים השנתי של המקדמות והחזר JSON בלבד, ללא markdown, ללא הסברים, ללא טקסט נוסף.

השדות הנדרשים:
- year: שנת המקדמות (מספר, למשל 2026)
- monthlyAmount: סכום חודשי (מספר). אם סכום זהה בכל חודש, החזר אותו; אם משתנה, החזר את הסכום השכיח ביותר.
- annualTotal: סכום שנתי כולל (מספר). אם לא מופיע במפורש, סכם את כל התשלומים.
- schedule: מערך של תשלומים. כל אחד בפורמט:
  - month: חודש המקדמה עליו משולם התשלום, בפורמט MM/YYYY
  - amount: סכום התשלום (מספר)
  - dueDate: תאריך אחרון לתשלום בפורמט YYYY-MM-DD. אם אין תאריך מפורש, השתמש ב-15 של החודש העוקב.
  - paymentUrl: אם לצד השורה של החודש מופיע קוד QR, פענח אותו והחזר את ה-URL המלא שהוא מקודד (מחרוזת). אם לא ניתן לפענח או אין QR, החזר null.

חשוב:
- החזר את כל 12 החודשים אם הם מופיעים במסמך.
- אם התאריכים לא מופיעים, חשב לפי הכלל: תשלום עבור חודש X ישולם עד ה-15 של החודש X+1.
- קודי QR בדפי המוסד לביטוח לאומי מכילים קישור תשלום ייחודי לכל חודש. קרא אותם בקפידה — אל תמציא URL אם אינך בטוח.
- החזר אך ורק JSON תקין, ללא עיטוף בבלוק קוד.`

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
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              fileContent,
              {
                type: 'text',
                text: 'חלץ את לוח התשלומים מהודעת הבל"ל הזו והחזר JSON בלבד.',
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[extract-btl-notice] Claude API error:', response.status, errorBody)
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
