// CALLER-KEYED ROUTE — authenticated via caller's Claude API key
import { NextRequest, NextResponse } from 'next/server'
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'

type HistoryEntry = { business: string; category: string }

type ClassifyBody = {
  apiKey: string
  monthStr: string
  transactions: BudgetTransaction[]
  categories: Category[]
  history: HistoryEntry[]
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<ClassifyBody>
    const { apiKey, monthStr, transactions, categories, history } = body

    if (!apiKey || !monthStr || !Array.isArray(transactions) || !Array.isArray(categories)) {
      return NextResponse.json(
        { error: 'Missing required fields: apiKey, monthStr, transactions, categories' },
        { status: 400 },
      )
    }

    // Build a compact representation for the model — only the fields it needs.
    const slimTransactions = transactions.map((t) => ({
      txId: t.id,
      date: t.date,
      business: t.business,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      installmentInfo: t.installmentInfo ?? null,
    }))

    const slimCategories = categories.map((c) => ({
      name: c.name,
      type: c.type,
      parent: c.parentId ? categories.find((p) => p.id === c.parentId)?.name ?? null : null,
      isCapital: !!c.isCapital,
      isExternal: !!c.isExternal,
      isDeductible: !!c.isDeductible,
    }))

    const slimHistory = (history || []).slice(0, 500).map((h) => ({
      business: h.business,
      category: h.category,
    }))

    const systemPrompt = `אתה עוזר חכם לסיווג עסקאות פיננסיות בישראל. יש לך ידע נרחב על ספקים, רשתות, חברות ומותגים ישראליים (לדוגמה: "מעיינות השרון" = חברת מים אזורית, "פלאפון" = חברת תקשורת, "מכבי" יכול להיות קופת חולים או רשת סופרמרקטים, "פזומט" = תחנת דלק וכו').

המשימה שלך:
1. קבל רשימה של עסקאות לא מסווגות לחודש מסוים.
2. קבל את רשימת הנושאים (קטגוריות) הזמינים — חייב לסווג רק לנושא קיים מתוך הרשימה (השתמש בשם המדויק).
3. קבל היסטוריה של מיפויים קודמים בין שמות עסקים לנושאים — השתמש בה כעדות חזקה (אם המשתמש כבר סיווג בעבר עסק מסוים לנושא מסוים, סווג כך גם הפעם).
4. החזר JSON בלבד עם שני שדות: "confident" ו-"askUser".

confident: עסקאות שאתה בטוח לגביהן (היסטוריה ברורה, או ספק מובהק שאין לגביו ספק). לכל עסקה החזר:
  - txId: מזהה העסקה (חובה, בדיוק כפי שנשלח)
  - subject: שם הנושא (חייב להיות שם מדויק מתוך רשימת הנושאים)
  - reasoning: משפט קצר בעברית למה בחרת בנושא הזה

askUser: עסקאות אמביוולנטיות שצריך לשאול את המשתמש. לכל אחת:
  - txId: מזהה העסקה
  - business: שם העסק (כפי שנשלח)
  - amount: הסכום (מספר, כולל סימן)
  - options: 2-4 נושאים אפשריים (שמות מדויקים מהרשימה)
  - why: הסבר קצר בעברית למה זה אמביוולנטי

חשוב מאוד:
- החזר אך ורק JSON תקין. ללא markdown, ללא בלוקי קוד, ללא טקסט לפני או אחרי.
- אל תמציא שמות נושאים — השתמש רק בשמות מדויקים מהרשימה שניתנה.
- אם אתה לא מצליח להחליט בין 2 נושאים, העדף askUser במקום ניחוש.
- חיובי כרטיס/הוראת קבע/ביטוח/חשבונות חוזרים — בדרך כלל יש להם נושא קבוע ברור.
- הקפד שכל txId שאתה מחזיר מופיע ב-confident או ב-askUser, לא בשניהם.
- כל עסקה חייבת להיות מסווגת באחת משתי הרשימות. אל תשמיט עסקאות.`

    const userMessage = `חודש: ${monthStr}

נושאים זמינים:
${JSON.stringify(slimCategories, null, 2)}

היסטוריית מיפויים (עסק → נושא):
${JSON.stringify(slimHistory, null, 2)}

עסקאות לסיווג:
${JSON.stringify(slimTransactions, null, 2)}

החזר JSON בלבד בפורמט:
{"confident": [...], "askUser": [...]}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[classify-transactions] Claude API error:', response.status, errorBody)
      return NextResponse.json(
        { error: `Claude API error: ${response.status}`, details: errorBody },
        { status: response.status },
      )
    }

    const data = await response.json()
    const text: string = data.content?.[0]?.text ?? ''

    // Be lenient about a leading ```json code fence in case the model adds one despite instructions.
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    try {
      const parsed = JSON.parse(cleaned)
      // Defensive defaults so callers never crash on missing arrays.
      return NextResponse.json({
        confident: Array.isArray(parsed.confident) ? parsed.confident : [],
        askUser: Array.isArray(parsed.askUser) ? parsed.askUser : [],
      })
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
