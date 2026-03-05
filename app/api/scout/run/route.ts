/**
 * Scout Run API Route
 * Daily cron job + manual trigger — runs the saved search prompt to find opportunities.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient, type LLMProvider } from '@/app/services/llm'

const SYSTEM_PROMPT = `אתה סוכן חיפוש הזדמנויות למוזיקאים. תקבל פרומפט חיפוש שמתאר מה המשתמש מחפש.

חפש באינטרנט הזדמנויות קונקרטיות ופתוחות. לכל הזדמנות, ספק:
- שם מדויק
- קישור ישיר לדף ההרשמה/הגשה (לא לאתר הראשי)
- מקור (באיזה אתר/ארגון מצאת)
- תיאור קצר בעברית
- דדליין להגשה (אם ידוע)
- פרטים נוספים (פרס, מיקום, דרישות)

החזר תוצאות בפורמט JSON בתגית <results>:
<results>
[
  {
    "title": "שם ההזדמנות",
    "url": "קישור ישיר להרשמה",
    "source": "שם האתר/הארגון",
    "summary": "תיאור קצר בעברית",
    "deadline": "תאריך אחרון להגשה",
    "details": "פרס, מיקום, דרישות"
  }
]
</results>

חפש לפחות 5 הזדמנויות. התמקד בהזדמנויות עדכניות עם דדליין פתוח.
אל תמציא — ספק רק תוצאות שמצאת בפועל עם קישורים אמיתיים.`

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')
  const searchPrompt = searchParams.get('searchPrompt')
  const provider = searchParams.get('provider') as LLMProvider | null
  const apiKey = searchParams.get('apiKey')

  if (!businessId || !searchPrompt) {
    return NextResponse.json({
      success: false,
      error: 'נדרשים businessId ו-searchPrompt',
    }, { status: 400 })
  }

  try {
    const client = getLLMClient(provider || undefined)
    const result = await client.chat({
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: searchPrompt,
      }],
      enableWebSearch: true,
      maxTokens: 4096,
      apiKey: apiKey || undefined,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    const resultsMatch = result.text.match(/<results>\s*([\s\S]*?)\s*<\/results>/)
    let results: Array<{
      title: string
      url?: string
      source?: string
      summary: string
      deadline?: string
      details?: string
    }> = []

    if (resultsMatch) {
      try {
        results = JSON.parse(resultsMatch[1])
      } catch {
        console.error('[Scout Run] Failed to parse results')
      }
    }

    const now = new Date().toISOString()
    const scoutResults = results.map(r => ({
      businessId: Number(businessId),
      title: r.title,
      url: r.url,
      source: r.source,
      summary: r.summary,
      deadline: r.deadline,
      details: r.details,
      status: 'new' as const,
      foundAt: now,
    }))

    return NextResponse.json({
      success: true,
      results: scoutResults,
      count: scoutResults.length,
    })
  } catch (err: any) {
    console.error('[Scout Run] Error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בחיפוש' }, { status: 500 })
  }
}
