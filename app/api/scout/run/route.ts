/**
 * Scout Run API Route
 * Daily cron job + manual trigger for searching audition opportunities
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SEARCH_PROMPT = `אתה סוכן חיפוש אודישנים ותחרויות מוזיקה. קיבלת קונפיגורציית חיפוש מהמשתמש.

חפש באינטרנט הזדמנויות רלוונטיות על פי הקונפיגורציה. לכל הזדמנות שמצאת, החזר מידע מובנה.

החזר את התוצאות בפורמט JSON בתוך תגית <results>:
<results>
[
  {
    "title": "שם ההזדמנות",
    "url": "קישור לדף",
    "source": "מאיפה מצאת (אתר, ארגון)",
    "summary": "תיאור קצר בעברית",
    "deadline": "תאריך אחרון להגשה (אם ידוע)",
    "details": "פרטים נוספים (פרס, מיקום, דרישות)"
  }
]
</results>

חפש לפחות 3-5 הזדמנויות. התמקד בהזדמנויות עדכניות ופתוחות.`

export async function GET(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY לא מוגדר' }, { status: 500 })
  }

  // Accept businessId and config from query params (manual trigger) or process all (cron)
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')
  const configParam = searchParams.get('config')

  if (!businessId || !configParam) {
    return NextResponse.json({
      success: false,
      error: 'נדרשים businessId ו-config',
    }, { status: 400 })
  }

  let config: Record<string, unknown>
  try {
    config = JSON.parse(configParam)
  } catch {
    return NextResponse.json({ success: false, error: 'config לא תקין' }, { status: 400 })
  }

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SEARCH_PROMPT,
      messages: [{
        role: 'user',
        content: `קונפיגורציית חיפוש:\n${JSON.stringify(config, null, 2)}\n\nחפש הזדמנויות עדכניות.`,
      }],
      tools: [{
        type: 'web_search_20250305' as const,
        name: 'web_search',
        max_uses: 10,
      }],
    })

    // Extract results from response
    let fullText = ''
    for (const block of response.content) {
      if (block.type === 'text') {
        fullText += block.text
      }
    }

    const resultsMatch = fullText.match(/<results>\s*([\s\S]*?)\s*<\/results>/)
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

    // Format results as ScoutResult-compatible objects
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
