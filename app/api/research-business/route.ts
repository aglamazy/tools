// CALLER-KEYED ROUTE — Gemini key comes from server env (NEXT_PUBLIC_GEMINI_API_KEY).
// Used by the smart-classifier to look up unfamiliar vendors via Google Search grounding.
import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient } from '@/app/services/llm'

export const maxDuration = 30

type RequestBody = {
  business: string
  options: string[]
  allSubjects: string[]
  amountSign: 'positive' | 'negative'
}

type ResearchResult = {
  description: string
  matchedSubject: string | null
  confidence: 'low' | 'medium' | 'high'
}

const SYSTEM = `אתה עוזר חוקר עסקים ישראליים. המשתמש נותן לך שם של עסק (כפי שהוא מופיע בדף כרטיס אשראי / בנק) ושאלה על הסיווג שלו.
התשובה שלך תשמש לסווג עסקה אוטומטית.

תהליך:
1. השתמש בחיפוש Google כדי להבין מה העסק עושה (אתר רשמי, Google Maps, ויקיפדיה וכו').
2. שים לב לכיוון הסכום: אם שלילי — הוצאה (חיוב); אם חיובי — הכנסה (זיכוי).
3. בחר את הנושא המתאים ביותר מתוך options. אם אף אחד לא מתאים — בחר מהרשימה allSubjects.
4. אם אין לך וודאות מספקת — החזר matchedSubject: null ו-confidence: low.

החזר JSON בלבד עם השדות:
- description: משפט קצר בעברית — מה העסק (סוג, מיקום אם רלוונטי).
- matchedSubject: שם הנושא הנבחר, או null.
- confidence: 'low' | 'medium' | 'high'.

ללא markdown. JSON תקין בלבד.`

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody
    const { business, options, allSubjects, amountSign } = body

    if (!business || !Array.isArray(options) || !Array.isArray(allSubjects)) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Gemini API key' }, { status: 500 })
    }

    const userMessage = `שם העסק: "${business}"
כיוון העסקה: ${amountSign === 'negative' ? 'הוצאה' : 'הכנסה'}
options (העדף בחירה מתוך אלה): ${options.join(', ')}
allSubjects (אם options לא מתאים): ${allSubjects.join(', ')}

חקור והחזר JSON.`

    const client = getLLMClient('gemini')
    const result = await client.chat({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      enableWebSearch: true,
      apiKey,
      maxTokens: 600,
      temperature: 0.2,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    let parsed: ResearchResult
    try {
      const cleaned = result.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
      parsed = JSON.parse(cleaned) as ResearchResult
    } catch {
      return NextResponse.json({ error: 'Could not parse research JSON', raw: result.text }, { status: 500 })
    }

    return NextResponse.json({
      description: parsed.description || '',
      matchedSubject: parsed.matchedSubject || null,
      confidence: parsed.confidence || 'low',
      groundingSources: result.groundingSources || [],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
