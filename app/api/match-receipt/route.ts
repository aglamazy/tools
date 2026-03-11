// CALLER-KEYED ROUTE — uses platform Gemini key + caller's Claude API key
import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient } from '@/app/services/llm'

type Candidate = {
  messageId: string
  from: string
  subject: string
  date: string
  snippet: string
}

type TransactionInfo = {
  date: string
  description: string
  amount: number
  merchant?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'match') {
      return handleMatch(body.transaction, body.candidates)
    } else if (action === 'extract') {
      return handleExtract(body.emailBody, body.transaction, body.claudeApiKey)
    } else if (action === 'extract-pdf') {
      return handleExtractPdf(body.pdfBase64, body.transaction, body.claudeApiKey)
    } else if (action === 'extract-image') {
      return handleExtractImage(body.imageBase64, body.mediaType, body.transaction, body.claudeApiKey)
    } else if (action === 'download-pdf') {
      return handleDownloadPdf(body.url)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function handleMatch(transaction: TransactionInfo, candidates: Candidate[]) {
  if (!transaction || !candidates?.length) {
    return NextResponse.json({ error: 'Missing transaction or candidates' }, { status: 400 })
  }

  const gemini = getLLMClient('gemini')

  const candidateList = candidates.map((c, i) =>
    `[${i}] מאת: ${c.from}\n    נושא: ${c.subject}\n    תאריך: ${c.date}\n    תקציר: ${c.snippet}`
  ).join('\n\n')

  const result = await gemini.chat({
    system: `אתה מומחה בהתאמת עסקאות בנקאיות להודעות מייל.

כללים:
- תיאור העסקה בכרטיס אשראי לרוב מופיע בצורה שונה מהשולח במייל. דוגמאות:
  וואי-פיי = YPAY, שופרסל = SHUFERSAL, הוט מובייל = HOT MOBILE, גוגל = Google Play
- אתה צריך לזהות את השולח (from) שמתאים לעסקה, גם אם הנושא לא מכיל קבלה
- הסכום לא בהכרח מופיע בנושא המייל
- התאריך צריך להיות קרוב (עד 10 ימים הפרש)

אם מצאת התאמה ברורה — החזר matchIndex.
אם אתה מזהה את השולח הנכון אבל לא מצאת את הקבלה עצמה — החזר matchIndex: null אבל הוסף senderHint עם כתובת המייל של השולח שנראה רלוונטי, כדי שנוכל לחפש שוב.

החזר JSON בלבד:
{ "matchIndex": <מספר או null>, "senderHint": "<כתובת מייל או null>", "confidence": "high"|"medium"|"low", "reason": "<הסבר קצר>" }`,
    messages: [{
      role: 'user',
      content: `עסקה בכרטיס אשראי:
- תיאור: ${transaction.description}
- סכום: ₪${Math.abs(transaction.amount)}
- תאריך: ${transaction.date}
${transaction.merchant ? `- בית עסק: ${transaction.merchant}` : ''}

הודעות מייל באותה תקופה:
${candidateList}`,
    }],
    maxTokens: 256,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  try {
    const cleaned = result.text.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const matchedCandidate = parsed.matchIndex != null ? candidates[parsed.matchIndex] : null
    return NextResponse.json({
      messageId: matchedCandidate?.messageId ?? null,
      senderHint: parsed.senderHint || null,
      confidence: parsed.confidence || 'low',
      reason: parsed.reason || '',
    })
  } catch {
    return NextResponse.json({ messageId: null, confidence: 'low', reason: 'Failed to parse LLM response' })
  }
}

async function handleExtract(emailBody: string, transaction: TransactionInfo, claudeApiKey?: string) {
  if (!emailBody) {
    return NextResponse.json({ error: 'Missing emailBody' }, { status: 400 })
  }

  if (!claudeApiKey) {
    return NextResponse.json({ error: 'Missing Claude API key' }, { status: 400 })
  }

  // Truncate very long emails
  const truncated = emailBody.length > 50000 ? emailBody.substring(0, 50000) : emailBody

  // Strip HTML but preserve link URLs
  const textContent = truncated.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `אתה מומחה לחילוץ נתונים מקבלות וחשבוניות ישראליות שנשלחו במייל.
חלץ את השדות הבאים והחזר JSON בלבד, ללא markdown, ללא הסברים.

השדות:
- vendor: שם העסק / ספק
- documentTitle: כותרת המסמך (לדוגמה: "חשבונית מס / קבלה 12345", "אישור הזמנה" וכו')
- date: תאריך בפורמט DD/MM/YYYY
- amount: סכום כולל (מספר)
- vatAmount: סכום מע״מ אם מופיע (מספר או null)
- description: תיאור קצר של הפריטים / השירות
- invoiceNumber: מספר חשבונית / קבלה (מחרוזת או null)
- documentUrl: קישור למסמך/קבלה/חשבונית אם יש (URL מלא או null)

העסקה הבנקאית לעיון: ${transaction.description}, ₪${Math.abs(transaction.amount)}, ${transaction.date}

החזר אך ורק JSON תקין.`,
      messages: [{
        role: 'user',
        content: `חלץ נתוני קבלה מהמייל הבא:\n\n${textContent}`,
      }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[match-receipt] Claude API error:', response.status, errorBody)
    return NextResponse.json({ error: `Claude API error: ${response.status}` }, { status: response.status })
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse extraction response', raw: text }, { status: 502 })
  }
}

async function handleDownloadPdf(url: string) {
  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 })
  }

  // Follow redirects and download the PDF
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    return NextResponse.json({ error: `Download failed: ${response.status}` }, { status: 502 })
  }

  const contentType = response.headers.get('content-type') || 'application/pdf'
  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  // Extract filename from URL or Content-Disposition
  const disposition = response.headers.get('content-disposition')
  let fileName = 'receipt.pdf'
  if (disposition) {
    const match = disposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/)
    if (match) fileName = decodeURIComponent(match[1])
  } else {
    const urlPath = new URL(response.url).pathname
    const lastSegment = urlPath.split('/').pop()
    if (lastSegment && lastSegment.includes('.')) fileName = lastSegment
  }

  return NextResponse.json({ base64, contentType, fileName })
}

async function handleExtractPdf(pdfBase64: string, transaction: TransactionInfo, claudeApiKey?: string) {
  if (!pdfBase64) {
    return NextResponse.json({ error: 'Missing pdfBase64' }, { status: 400 })
  }
  if (!claudeApiKey) {
    return NextResponse.json({ error: 'Missing Claude API key' }, { status: 400 })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `אתה מומחה לחילוץ נתונים מקבלות וחשבוניות ישראליות.
חלץ את השדות הבאים והחזר JSON בלבד, ללא markdown, ללא הסברים.

השדות:
- vendor: שם העסק / ספק
- documentTitle: כותרת המסמך (לדוגמה: "חשבונית מס / קבלה 12345", "אישור הזמנה" וכו')
- date: תאריך בפורמט DD/MM/YYYY
- amount: סכום כולל (מספר)
- vatAmount: סכום מע״מ אם מופיע (מספר או null)
- description: תיאור קצר של הפריטים / השירות
- invoiceNumber: מספר חשבונית / קבלה (מחרוזת או null)

העסקה הבנקאית לעיון: ${transaction.description}, ₪${Math.abs(transaction.amount)}, ${transaction.date}

החזר אך ורק JSON תקין.`,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: 'חלץ נתוני קבלה מהמסמך המצורף.',
          },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[match-receipt] Claude PDF extraction error:', response.status, errorBody)
    return NextResponse.json({ error: `Claude API error: ${response.status}` }, { status: response.status })
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse extraction response', raw: text }, { status: 502 })
  }
}

async function handleExtractImage(imageBase64: string, mediaType: string, transaction: TransactionInfo, claudeApiKey?: string) {
  if (!imageBase64) {
    return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 })
  }
  if (!claudeApiKey) {
    return NextResponse.json({ error: 'Missing Claude API key' }, { status: 400 })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `אתה מומחה לחילוץ נתונים מקבלות וחשבוניות ישראליות.
חלץ את השדות הבאים והחזר JSON בלבד, ללא markdown, ללא הסברים.

השדות:
- vendor: שם העסק / ספק
- documentTitle: כותרת המסמך (לדוגמה: "חשבונית מס / קבלה 12345", "אישור הזמנה" וכו')
- date: תאריך בפורמט DD/MM/YYYY
- amount: סכום כולל (מספר)
- vatAmount: סכום מע״מ אם מופיע (מספר או null)
- description: תיאור קצר של הפריטים / השירות
- invoiceNumber: מספר חשבונית / קבלה (מחרוזת או null)

העסקה הבנקאית לעיון: ${transaction.description}, ₪${Math.abs(transaction.amount)}, ${transaction.date}

החזר אך ורק JSON תקין.`,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'חלץ נתוני קבלה מהתמונה המצורפת.',
          },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[match-receipt] Claude image extraction error:', response.status, errorBody)
    return NextResponse.json({ error: `Claude API error: ${response.status}` }, { status: response.status })
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse extraction response', raw: text }, { status: 502 })
  }
}
