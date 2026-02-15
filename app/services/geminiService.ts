/**
 * Gemini Service
 * Uses Gemini 2.0 Flash via API key to extract reusable Gmail filter criteria.
 */

import { type GmailFilterCriteria } from './gmailService'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`

const SYSTEM_PROMPT = `You extract Gmail filter criteria from an email's sender and subject line.
Given a sender address and subject, return JSON with the reusable parts for a Gmail filter:
- "from": the sender email address (just the email, no display name)
- "subject": a stemmed/simplified subject pattern that would match similar emails from this sender (remove unique IDs, dates, numbers, order numbers, etc. — keep only the recurring keywords)

Return ONLY valid JSON with "from" and "subject" fields. No markdown, no explanation.

Examples:
Input: from="Amazon <shipment-tracking@amazon.com>" subject="Your order #112-3456789-0123456 has shipped"
Output: {"from":"shipment-tracking@amazon.com","subject":"order has shipped"}

Input: from="GitHub <notifications@github.com>" subject="[repo/project] Fix: resolve null pointer (#1234)"
Output: {"from":"notifications@github.com","subject":""}

Input: from="חשבונית ירוקה <noreply@greeninvoice.co.il>" subject="חשבונית מס׳ 12345 מחברת אבג"
Output: {"from":"noreply@greeninvoice.co.il","subject":"חשבונית"}`

export async function generateArchiveQuery(
  subject: string,
  from: string,
): Promise<{ criteria?: GmailFilterCriteria; error?: string }> {
  if (!GEMINI_API_KEY) {
    return { error: 'חסר מפתח Gemini API. הגדר NEXT_PUBLIC_GEMINI_API_KEY' }
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${SYSTEM_PROMPT}\n\nInput: from="${from}" subject="${subject}"\nOutput:`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 200,
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('[Gemini] Error:', response.status, errorBody)

      if (response.status === 429) {
        return { error: 'Gemini: חריגה ממכסה. נסה שוב בעוד דקה' }
      }
      if (response.status === 400) {
        return { error: 'מפתח Gemini API לא תקין' }
      }
      if (response.status === 403) {
        return { error: 'Gemini API לא מופעל בפרויקט. הפעל אותו ב-Google Cloud Console' }
      }
      return { error: 'שגיאה בקריאה ל-Gemini' }
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!text) {
      return { error: 'Gemini לא החזיר תשובה' }
    }

    // Parse the JSON — strip markdown code fences if present
    const jsonStr = text.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(jsonStr)

    const criteria: GmailFilterCriteria = {}
    if (parsed.from && typeof parsed.from === 'string') {
      criteria.from = parsed.from
    }
    if (parsed.subject && typeof parsed.subject === 'string') {
      criteria.subject = parsed.subject
    }

    if (!criteria.from && !criteria.subject) {
      return { error: 'Gemini לא הצליח לחלץ קריטריונים מההודעה' }
    }

    return { criteria }
  } catch (err: any) {
    console.error('[Gemini] Error:', err)
    if (err instanceof SyntaxError) {
      return { error: 'Gemini החזיר תשובה לא תקינה' }
    }
    return { error: 'שגיאת רשת בקריאה ל-Gemini' }
  }
}
