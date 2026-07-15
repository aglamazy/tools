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

    const result = await extractJsonWithFallback<Record<string, unknown>>({
      routeName: 'extract-btl-notice',
      systemPrompt,
      userParts: [
        mimeType === 'application/pdf'
          ? { type: 'document', data: fileBase64 }
          : { type: 'image', data: fileBase64, mimeType },
        { type: 'text', text: 'חלץ את לוח התשלומים מהודעת הבל"ל הזו והחזר JSON בלבד.' },
      ],
      anthropicApiKey: apiKey,
      geminiModel: 'gemini-2.5-flash',
      geminiMaxTokens: 2048,
      anthropicModel: 'claude-sonnet-5',
      anthropicMaxTokens: 2048,
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
