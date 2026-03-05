/**
 * Scout Chat API Route
 * Interactive search training — helps user find opportunities, then saves a
 * standalone search prompt that the cron job can run without conversation context.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient, type LLMProvider, type LLMMessage } from '@/app/services/llm'

const SYSTEM_PROMPT = `אתה עוזר למוזיקאים למצוא הזדמנויות קונקרטיות: אודישנים, תחרויות, הופעות, קולות קוראים.

## איך לעזור למשתמש
1. שאל מה הוא מחפש — כלי נגינה, סגנון, מיקום, גיל, רמה, סוג הזדמנות
2. חפש באינטרנט הזדמנויות אמיתיות ופתוחות
3. לכל הזדמנות שמצאת, ספק:
   - שם ותיאור קצר
   - **קישור**: עדיפות ראשונה — דף הרשמה/הגשה ישיר. אם אין, קישור לדף הספציפי שבו מצאת את המידע. חובה לספק URL אמיתי שמתחיל ב-https.
   - דדליין להגשה (אם ידוע)
   - פרטים רלוונטיים (פרס, מיקום, דרישות)
4. שאל אם התוצאות רלוונטיות, מה לשנות, מה להוסיף או להוריד

## שמירת תוצאות מובנות
כשמצאת הזדמנויות, שמור אותן גם בפורמט JSON בתגית <results>:
<results>
[
  {
    "title": "שם ההזדמנות",
    "url": "https://... (דף הרשמה, או דף המקור שבו מצאת את המידע. חייב להיות URL תקין)",
    "source": "שם האתר/הארגון",
    "summary": "תיאור קצר בעברית",
    "deadline": "תאריך אחרון להגשה",
    "details": "פרס, מיקום, דרישות"
  }
]
</results>

## שמירת פרומפט חיפוש
אחרי כל תשובה שלך, צור גרסה מעודכנת של פרומפט חיפוש עצמאי.
זהו פרומפט שסוכן AI אחר יוכל להריץ בלי הקשר השיחה — הוא מכיל את כל מה שצריך כדי לחפש.

שמור אותו בתגית <search_prompt>:
<search_prompt>
חפש אודישנים ותחרויות בינלאומיות לנגני חליל צעירים (גיל 18-30).
התמקד ב: תחרויות סולו, תחרויות קאמרית, אודישנים לתזמורות צעירות.
אזורים: אירופה, ישראל.
לא לכלול: קורסי מאסטר, סדנאות.
שפות חיפוש: עברית, אנגלית, גרמנית.
חפש הזדמנויות עם דדליין פתוח או בחודשים הקרובים.
לכל תוצאה ספק קישור ישיר לדף ההרשמה.
</search_prompt>

עדכן את הפרומפט בכל תשובה על פי מה שלמדת מהמשתמש.
ענה תמיד בעברית.`

export async function POST(request: NextRequest) {
  try {
    const { messages, provider, apiKey } = await request.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: 'הודעות חסרות' }, { status: 400 })
    }

    const client = getLLMClient(provider as LLMProvider)
    const result = await client.chat({
      system: SYSTEM_PROMPT,
      messages: messages as LLMMessage[],
      enableWebSearch: true,
      apiKey,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    let assistantText = result.text
    let searchPrompt: string | null = null
    let results: Array<Record<string, string>> = []

    // Extract search prompt if present
    const promptMatch = assistantText.match(/<search_prompt>\s*([\s\S]*?)\s*<\/search_prompt>/)
    if (promptMatch) {
      searchPrompt = promptMatch[1].trim()
      assistantText = assistantText.replace(/<search_prompt>[\s\S]*?<\/search_prompt>/, '').trim()
    }

    // Extract structured results if present
    const resultsMatch = assistantText.match(/<results>\s*([\s\S]*?)\s*<\/results>/)
    if (resultsMatch) {
      try {
        results = JSON.parse(resultsMatch[1])
      } catch {
        console.error('[Scout Chat] Failed to parse results')
      }
      assistantText = assistantText.replace(/<results>[\s\S]*?<\/results>/, '').trim()
    }

    return NextResponse.json({
      success: true,
      message: assistantText,
      searchPrompt,
      results,
    })
  } catch (err: any) {
    console.error('[Scout Chat] Error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בתקשורת עם AI' }, { status: 500 })
  }
}
