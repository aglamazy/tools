// CALLER-KEYED ROUTE — authenticated via caller's API key
/**
 * Scout Run API Route
 * Daily cron job + manual trigger — runs the saved search prompt to find opportunities.
 * Accepts user feedback to improve results over time.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient, type LLMProvider } from '@/app/services/llm'
import { withServiceCall } from '@/app/lib/observe'

const SYSTEM_PROMPT = `אתה סוכן חיפוש הזדמנויות למוזיקאים. תקבל פרומפט חיפוש שמתאר מה המשתמש מחפש.

חפש באינטרנט הזדמנויות קונקרטיות ופתוחות. לכל הזדמנות, ספק:
- שם מדויק
- קישור: עדיפות ראשונה — דף הרשמה/הגשה ישיר. אם אין, קישור לדף הספציפי שבו מצאת את המידע. חובה URL תקין (https://...). לעולם אל תכתוב טקסט במקום URL.
- מקור (באיזה אתר/ארגון מצאת)
- תיאור קצר בעברית
- דדליין להגשה (אם ידוע)
- פרטים נוספים (פרס, מיקום, דרישות)

החזר תוצאות בפורמט JSON בתגית <results>:
<results>
[
  {
    "title": "שם ההזדמנות",
    "url": "https://... (דף הרשמה או דף המקור — חייב URL תקין)",
    "source": "שם האתר/הארגון",
    "summary": "תיאור קצר בעברית",
    "deadline": "תאריך אחרון להגשה",
    "details": "פרס, מיקום, דרישות"
  }
]
</results>

חפש לפחות 5 הזדמנויות. התמקד בהזדמנויות עדכניות עם דדליין פתוח.
אל תמציא — ספק רק תוצאות שמצאת בפועל עם קישורים אמיתיים.`

async function POSTHandler(request: NextRequest) {
  try {
    const { businessId, searchPrompt, feedback, provider, apiKey } = await request.json()

    if (!businessId || !searchPrompt) {
      return NextResponse.json({
        success: false,
        error: 'נדרשים businessId ו-searchPrompt',
      }, { status: 400 })
    }

    const userContent = feedback
      ? `${searchPrompt}\n\n## משוב מהמשתמש על תוצאות קודמות\n${feedback}`
      : searchPrompt

    const client = getLLMClient(provider as LLMProvider)
    const result = await client.chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      enableWebSearch: true,
      maxTokens: 4096,
      apiKey: apiKey || undefined,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    // Build a map of grounding sources by title for URL matching
    const groundingByTitle = new Map<string, string>()
    for (const src of result.groundingSources || []) {
      if (src.title) groundingByTitle.set(src.title.toLowerCase(), src.url)
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

    // Enrich results with grounding URLs when the LLM didn't provide a valid one
    for (const r of results) {
      const hasValidUrl = r.url && r.url.startsWith('https://')
      if (!hasValidUrl) {
        // Try to match by title
        const titleLower = r.title.toLowerCase()
        for (const [groundTitle, groundUrl] of groundingByTitle) {
          if (titleLower.includes(groundTitle) || groundTitle.includes(titleLower)) {
            r.url = groundUrl
            break
          }
        }
        // Fallback: use first grounding source if still no URL
        if (!r.url && result.groundingSources?.length) {
          r.url = result.groundingSources[0].url
        }
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

export const POST = withServiceCall(POSTHandler)
