/**
 * Scout Chat API Route
 * Proxies chat to Claude API with web search tools for audition scout configuration
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `אתה עוזר למוזיקאים למצוא אודישנים, תחרויות והזדמנויות הופעה.

תפקידך:
1. להבין מה המשתמש מחפש (כלי נגינה, סגנון, מיקום, סוג הזדמנות)
2. לחפש באינטרנט דוגמאות רלוונטיות ולהראות למשתמש
3. לבנות קונפיגורציית חיפוש בהתאם לדרישות

כשהמשתמש מרוצה מהתוצאות, שמור קונפיגורציה בפורמט JSON בתוך תגית <search_config>:
<search_config>
{
  "keywords": ["מילות מפתח לחיפוש"],
  "instrument": "כלי הנגינה",
  "locations": ["מיקומים רלוונטיים"],
  "opportunityTypes": ["audition", "competition", "performance"],
  "languages": ["he", "en"],
  "summary": "תיאור חופשי של מה שמחפשים",
  "exclusions": ["מה לא לכלול"]
}
</search_config>

ענה תמיד בעברית. חפש באינטרנט כדי לתת דוגמאות אמיתיות.`

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY לא מוגדר' }, { status: 500 })
  }

  try {
    const { messages } = await request.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: 'הודעות חסרות' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools: [{
        type: 'web_search_20250305' as const,
        name: 'web_search',
        max_uses: 5,
      }],
    })

    // Extract text and search config from response
    let assistantText = ''
    let searchConfig: Record<string, unknown> | null = null

    for (const block of response.content) {
      if (block.type === 'text') {
        assistantText += block.text
      }
    }

    // Extract search config if present
    const configMatch = assistantText.match(/<search_config>\s*([\s\S]*?)\s*<\/search_config>/)
    if (configMatch) {
      try {
        searchConfig = JSON.parse(configMatch[1])
        // Remove the config tag from visible text
        assistantText = assistantText.replace(/<search_config>[\s\S]*?<\/search_config>/, '').trim()
      } catch {
        console.error('[Scout Chat] Failed to parse search config')
      }
    }

    return NextResponse.json({
      success: true,
      message: assistantText,
      searchConfig,
    })
  } catch (err: any) {
    console.error('[Scout Chat] Error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בתקשורת עם Claude' }, { status: 500 })
  }
}
