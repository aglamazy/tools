// CALLER-KEYED ROUTE — authenticated via caller's Claude API key
import { NextRequest, NextResponse } from 'next/server'
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'
import { parseClaudeJson } from '@/app/utils/parseClaudeJson'
import { withServiceCall } from '@/app/lib/observe'

type HistoryEntry = { business: string; category: string }

type ClassifyBody = {
  apiKey: string
  monthStr: string
  transactions: BudgetTransaction[]
  categories: Category[]
  history: HistoryEntry[]
}

async function POSTHandler(req: NextRequest) {
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

    // Cap how many txs go in one Claude call. The 8k output-token budget
    // comfortably fits ~50 txs with the verbose Hebrew "reasoning"/"why"
    // fields; larger batches truncated mid-JSON. We chunk server-side so
    // the client passes the full list as one request.
    const CHUNK_SIZE = 50

    const callClaude = async (
      batch: typeof slimTransactions,
    ): Promise<{ confident: unknown[]; askUser: unknown[] }> => {
      const userMessage = `חודש: ${monthStr}

נושאים זמינים:
${JSON.stringify(slimCategories, null, 2)}

היסטוריית מיפויים (עסק → נושא):
${JSON.stringify(slimHistory, null, 2)}

עסקאות לסיווג:
${JSON.stringify(batch, null, 2)}

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
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error('[classify-transactions] Claude API error:', response.status, errorBody)
        throw new Error(`Claude API ${response.status}: ${errorBody.slice(0, 200)}`)
      }

      const data = await response.json()
      const text: string = data.content?.[0]?.text ?? ''
      const stopReason: string | undefined = data.stop_reason
      if (stopReason === 'max_tokens') {
        // Shouldn't happen at CHUNK_SIZE=50, but if it does the chunk is
        // too big for the model — surface as a hard error so we shrink the
        // cap rather than silently dropping txs.
        throw new Error(`Claude response truncated (max_tokens) on a ${batch.length}-tx chunk; shrink CHUNK_SIZE`)
      }

      const parsed = parseClaudeJson<{ confident?: unknown; askUser?: unknown }>(text)
      return {
        confident: Array.isArray(parsed.confident) ? parsed.confident : [],
        askUser: Array.isArray(parsed.askUser) ? parsed.askUser : [],
      }
    }

    // Chunk the txs and classify each chunk. Sequential keeps it predictable
    // under Anthropic rate limits; parallelize later only if measured slow.
    const chunks: (typeof slimTransactions)[] = []
    for (let i = 0; i < slimTransactions.length; i += CHUNK_SIZE) {
      chunks.push(slimTransactions.slice(i, i + CHUNK_SIZE))
    }

    try {
      const merged = { confident: [] as unknown[], askUser: [] as unknown[] }
      for (let i = 0; i < chunks.length; i++) {
        const partial = await callClaude(chunks[i])
        merged.confident.push(...partial.confident)
        merged.askUser.push(...partial.askUser)
        console.log(
          `[classify-transactions] chunk ${i + 1}/${chunks.length} ` +
          `(${chunks[i].length} txs) → confident=${partial.confident.length} ` +
          `askUser=${partial.askUser.length}`,
        )
      }
      return NextResponse.json(merged)
    } catch (chunkErr: unknown) {
      const msg = chunkErr instanceof Error ? chunkErr.message : 'Unknown chunk error'
      return NextResponse.json(
        { error: 'Failed to classify transactions', details: msg, chunkCount: chunks.length },
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

export const POST = withServiceCall(POSTHandler)
