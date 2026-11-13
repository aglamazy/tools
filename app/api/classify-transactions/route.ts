// CALLER-KEYED ROUTE — authenticated via caller's Claude API key
import { NextRequest, NextResponse } from 'next/server'
import { withServiceCall } from 'agents-observe/next'
import Anthropic from '@anthropic-ai/sdk'
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'
import { parseClaudeJson } from '@/app/utils/parseClaudeJson'
import { CLASSIFY_MODEL } from '@/app/services/llm/modelRegistry'
import {
  CLASSIFY_BATCH_SIZE,
  CLASSIFY_EFFORT,
  CLASSIFY_PARALLEL,
  chunkList,
  runPool,
} from '@/app/services/classify/classifyBatching'

type HistoryEntry = { business: string; category: string }

type ClassifyBody = {
  apiKey: string
  monthStr: string
  transactions: BudgetTransaction[]
  categories: Category[]
  history: HistoryEntry[]
}

async function handler(req: NextRequest) {
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

      // aglamazo#406: this used to be a raw fetch() to a hardcoded URL with a
      // hardcoded model string that had drifted from every other call site's
      // 'claude-sonnet-5' to a wrong 'claude-sonnet-4-6'. Now uses the SDK
      // client (already a project dependency) + the shared model registry.
      // Deliberately NOT routed through anthropicClient.ts's AnthropicClient
      // wrapper — its LLMResult shape has no stop_reason, and the max_tokens
      // truncation check below is a real safety net this route relies on;
      // unifying onto that wrapper would need it to surface stop_reason
      // first, which is a separate, larger change than this ticket's scope.
      let response
      try {
        // aglamazo#475: model, effort and batch shape come from the benchmark
        // (classifyBatching.ts); effort low keeps thinking short, which was
        // most of the old 46 s.
        response = await new Anthropic({ apiKey }).messages.create({
          model: CLASSIFY_MODEL,
          max_tokens: 8192,
          output_config: { effort: CLASSIFY_EFFORT },
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        })
      } catch (err: any) {
        console.error('[classify-transactions] Claude API error:', err?.status, err?.message)
        throw new Error(`Claude API ${err?.status ?? 'error'}: ${String(err?.message ?? err).slice(0, 200)}`)
      }

      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      const stopReason = response.stop_reason
      if (stopReason === 'max_tokens') {
        // Shouldn't happen at CLASSIFY_BATCH_SIZE, but if it does the chunk
        // is too big for the model — surface as a hard error so we shrink
        // the cap rather than silently dropping txs.
        throw new Error(`Claude response truncated (max_tokens) on a ${batch.length}-tx chunk; shrink CLASSIFY_BATCH_SIZE`)
      }

      const parsed = parseClaudeJson<{ confident?: unknown; askUser?: unknown }>(text)
      return {
        confident: Array.isArray(parsed.confident) ? parsed.confident : [],
        askUser: Array.isArray(parsed.askUser) ? parsed.askUser : [],
      }
    }

    // The page already sends CLASSIFY_BATCH_SIZE rows per request; this
    // chunking is the same shape for any other caller that sends more.
    // Measured slow when sequential (aglamazo#475), so chunks run CLASSIFY_PARALLEL at once.
    const chunks = chunkList(slimTransactions, CLASSIFY_BATCH_SIZE)

    try {
      const merged = { confident: [] as unknown[], askUser: [] as unknown[] }
      const partials = await runPool(chunks, CLASSIFY_PARALLEL, async (chunk, i) => {
        const t0 = Date.now()
        const partial = await callClaude(chunk)
        console.log(
          `[classify-transactions] chunk ${i + 1}/${chunks.length} ` +
          `(${chunk.length} txs, ${Date.now() - t0} ms) → confident=${partial.confident.length} ` +
          `askUser=${partial.askUser.length}`,
        )
        return partial
      })
      for (const partial of partials) {
        merged.confident.push(...partial.confident)
        merged.askUser.push(...partial.askUser)
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

export const POST = withServiceCall((req, ...args) => handler(req as NextRequest, ...args as []))
