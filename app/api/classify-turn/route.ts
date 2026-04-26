// CALLER-KEYED ROUTE — Gemini key comes from server env (NEXT_PUBLIC_GEMINI_API_KEY),
// and the route only runs the smart-classifier turn handler. No user auth needed.
import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient } from '@/app/services/llm'
import type { Category } from '@/app/types/category'

type TurnContext = {
  txId: string
  business: string
  amount: number
  options: string[]
  why?: string
}

type TurnBody = {
  context: TurnContext
  userMessage: string
  categories: Category[]
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<TurnBody>
    const { context, userMessage, categories } = body

    if (!context || !userMessage || !Array.isArray(categories)) {
      return NextResponse.json(
        { error: 'Missing required fields: context, userMessage, categories' },
        { status: 400 },
      )
    }

    const subjectNames = categories.map((c) => c.name)

    const systemPrompt = `אתה עוזר סיווג עסקאות בעברית. מטרתך לפרש את התשובה של המשתמש ולמפות אותה לאחד הנושאים הקיימים.

חוקים:
1. המשתמש קיבל הצעה לסיווג עסקה, עם רשימת אפשרויות. הוא ענה בטקסט חופשי.
2. אם הוא בחר נושא ברור (במפורש או ברמיזה), החזר אותו ב-"chosen" — חייב להיות שם מדויק מתוך רשימת הנושאים.
3. אם הוא רומז על כלל קבוע ("תמיד", "בכל פעם", "מעכשיו והלאה", "כל פעם שאתה רואה X תסווג כ-Y"), הוסף "ruleSuggestion" עם business+subject.
4. אם התשובה לא ברורה, אל תנחש — החזר "followUp" עם שאלת הבהרה קצרה ונחמדה בעברית.
5. אם המשתמש מבקש לדלג על העסקה הזו, החזר {"chosen": "__skip__"}.

החזר JSON בלבד, ללא markdown, ללא טקסט נוסף. הפורמט:
{
  "chosen": "<שם נושא או __skip__ או null>",
  "followUp": "<טקסט שאלה או null>",
  "ruleSuggestion": {"business": "...", "subject": "..."} או null
}

חשוב:
- חייב להיות לפחות אחד מ-chosen או followUp לא-null.
- ruleSuggestion רק אם המשתמש באמת רמז על כלל גורף, לא בכל סיווג.
- שם הנושא ב-chosen וב-ruleSuggestion.subject חייב להופיע בדיוק ברשימת הנושאים שניתנת לך.`

    const userPayload = `נושאים זמינים: ${JSON.stringify(subjectNames)}

הקשר העסקה:
- עסק: ${context.business}
- סכום: ${context.amount}
- אפשרויות שהוצעו: ${JSON.stringify(context.options || [])}
- למה זה אמביוולנטי: ${context.why ?? '—'}

תשובת המשתמש: "${userMessage}"

החזר JSON בלבד.`

    const client = getLLMClient('gemini')
    const result = await client.chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPayload }],
      maxTokens: 512,
      temperature: 0.2,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    const cleaned = (result.text || '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    try {
      const parsed = JSON.parse(cleaned)
      return NextResponse.json({
        chosen: parsed.chosen ?? null,
        followUp: parsed.followUp ?? null,
        ruleSuggestion: parsed.ruleSuggestion ?? null,
      })
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse Gemini response as JSON', raw: result.text },
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
