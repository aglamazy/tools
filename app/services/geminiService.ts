/**
 * Gemini Service
 * Uses Gemini 2.0 Flash via agents-ai's metered client to extract reusable Gmail filter criteria.
 */

import { createGeminiClient } from 'agents-ai'
import { type GmailFilterCriteria } from './gmailService'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

function getClient() {
  return createGeminiClient({ apiKey: GEMINI_API_KEY, model: 'gemini-2.0-flash' })
}

// agents-ai's client returns English error strings; this UI is Hebrew-only,
// so map its known error shapes back to the same Hebrew messages the direct
// fetch() calls used to produce (rate limit / bad key / HTTP status).
function localizeGeminiError(error: string): string {
  if (/rate limit/i.test(error)) return 'Gemini: חריגה ממכסה. נסה שוב בעוד דקה'
  if (/HTTP 400/i.test(error)) return 'מפתח Gemini API לא תקין'
  if (/HTTP 403/i.test(error)) return 'Gemini API לא מופעל בפרויקט. הפעל אותו ב-Google Cloud Console'
  if (/empty response/i.test(error)) return 'Gemini לא החזיר תשובה'
  if (/network error/i.test(error)) return 'שגיאת רשת בקריאה ל-Gemini'
  return 'שגיאה בקריאה ל-Gemini'
}

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

// --- Event date extraction ---

export type EventAnalysis = {
  id: string
  eventDate: string | null  // YYYY-MM-DD
  eventDescription: string | null
}

const EVENT_EXTRACTION_PROMPT = `You extract event dates from email subjects and snippets.
Given a JSON array of emails (each with id, subject, snippet), return a JSON array with:
- "id": the email id (copy as-is)
- "eventDate": the event date in YYYY-MM-DD format, or null if not an event email
- "eventDescription": a brief description of the event (Hebrew or English), or null

Rules:
- Only flag event/promotional emails: webinars, sales, concerts, conferences, meetups, limited-time offers with deadlines
- Do NOT flag shipping/delivery dates, order confirmations, receipts, or general newsletters without a specific event date
- Use YYYY-MM-DD format for dates
- For relative dates ("tomorrow", "next Tuesday"), use the current date provided to calculate the absolute date
- Return ONLY a valid JSON array. No markdown, no explanation.`

export async function extractEventDates(
  messages: { id: string; subject: string; snippet: string }[]
): Promise<{ results: EventAnalysis[]; error?: string }> {
  if (!GEMINI_API_KEY) {
    return { results: [], error: 'חסר מפתח Gemini API. הגדר GEMINI_API_KEY' }
  }

  const today = new Date().toISOString().split('T')[0]
  const input = JSON.stringify(messages)

  try {
    const response = await getClient().chat({
      system: EVENT_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: `Current date: ${today}\n\nEmails:\n${input}` }],
      temperature: 0,
      maxTokens: 1024,
    })

    if (response.error) {
      console.error('[Gemini] Event extraction error:', response.error)
      return { results: [], error: localizeGeminiError(response.error) }
    }

    const text = response.text?.trim()
    if (!text) return { results: [], error: 'Gemini לא החזיר תשובה' }

    const jsonStr = text.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) return { results: [], error: 'Gemini החזיר תשובה לא תקינה' }

    return { results: parsed as EventAnalysis[] }
  } catch (err: any) {
    console.error('[Gemini] Event extraction error:', err)
    if (err instanceof SyntaxError) return { results: [], error: 'Gemini החזיר תשובה לא תקינה' }
    return { results: [], error: 'שגיאת רשת בקריאה ל-Gemini' }
  }
}

export async function generateArchiveQuery(
  subject: string,
  from: string,
): Promise<{ criteria?: GmailFilterCriteria; error?: string }> {
  if (!GEMINI_API_KEY) {
    return { error: 'חסר מפתח Gemini API. הגדר GEMINI_API_KEY' }
  }

  try {
    const response = await getClient().chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Input: from="${from}" subject="${subject}"\nOutput:` }],
      temperature: 0,
      maxTokens: 200,
    })

    if (response.error) {
      console.error('[Gemini] Error:', response.error)
      return { error: localizeGeminiError(response.error) }
    }

    const text = response.text?.trim()

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
