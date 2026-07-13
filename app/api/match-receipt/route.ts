// CALLER-KEYED ROUTE — uses platform Gemini key + caller's Claude API key
import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient } from '@/app/services/llm'
import { parseClaudeJson } from '@/app/utils/parseClaudeJson'
import type { GmailInvoiceCandidate, SupplierMatchProposal } from '@/app/types/supplierWizard'

type Candidate = {
  messageId: string
  from: string
  subject: string
  date: string
  snippet: string
}

// Surface the ACTUAL provider error to the caller instead of a bare
// "Claude API error: 400". The receipt matcher was swallowing the real
// message — e.g. "credit balance is too low" — into a silent "no match",
// so the user saw "לא נמצא" while the real problem was depleted Anthropic
// credits. `providerError: true` lets the client distinguish a systemic
// provider failure (abort + tell the user) from a genuine non-match.
function claudeErrorResponse(status: number, errorBody: string) {
  let providerMsg = ''
  try { providerMsg = JSON.parse(errorBody)?.error?.message || '' } catch { /* non-JSON body */ }
  const friendly = /credit balance is too low/i.test(providerMsg)
    ? 'יתרת הקרדיט ב-Anthropic נמוכה מדי — טען קרדיט או הסר את מפתח Claude בהגדרות כדי לעבוד עם Gemini.'
    : (providerMsg || `Claude API error: ${status}`)
  return NextResponse.json({ error: friendly, providerError: true }, { status })
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
    } else if (action === 'extract-vat-payment') {
      return handleExtractVatPayment(body.pdfBase64, body.mediaType, body.claudeApiKey)
    } else if (action === 'download-pdf') {
      return handleDownloadPdf(body.url)
    } else if (action === 'match-supplier') {
      return handleMatchSupplier(body.candidates, body.suppliers)
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
  וואי-פיי = YPAY, שופרסל = SHUFERSAL, הוט מובייל = HOT MOBILE, גוגל = Google Play,
  VERCEL INC. = Vercel Inc., OPENAI *CHATGPT = OpenAI, GOOGLE *ONE = Google,
  CLAUDE.AI = Anthropic, AWS / AMAZON WEB = Amazon, STRIPE = Stripe, MICROSOFT *... = Microsoft.
- ספקים זרים (Vercel, OpenAI, Google, AWS, Stripe וכו') מחייבים במטבע זר (USD/EUR).
  הסכום בעסקה הוא בש״ח לאחר המרה — אל תפסול קבלה רק כי הסכום במייל שונה מהסכום בעסקה.
- אתה צריך לזהות את השולח (from) שמתאים לעסקה, גם אם הנושא לא מכיל קבלה.
- כאשר שם הספק בתיאור (במלואו או חלקי) מופיע גם בשולח (display name או דומיין) —
  זוהי **התאמה חזקה** ובדרך כלל מספיקה כדי להחזיר matchIndex, גם בלי התאמה של סכום.
- התאריך צריך להיות קרוב (עד 10 ימים הפרש).

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

type SupplierInput = {
  id: number
  name: string
  bankCardAliases: string[]
}

type SupplierMatchLLMEntry = {
  candidateIndex: number
  action: 'link-existing' | 'create-new' | 'no-match'
  matchedSupplierId?: number | null
  confidence?: 'high' | 'medium' | 'low'
  reasoning?: string
  proposedName?: string | null
}

/**
 * Suppliers Wizard step 2: for each Gmail-swept invoice candidate, decide
 * whether it matches an EXISTING supplier (fuzzy — sender identity vs.
 * bank/card description have near-zero string similarity, e.g. "Google Cloud
 * Platform" sender vs. "GOOGLE*CLOUD 4QZ73M" bank line), is a genuinely new
 * vendor, or isn't actually an invoice/receipt at all. Proposals only —
 * nothing is written to db.suppliers here (that's the review UI's job).
 */
async function handleMatchSupplier(candidates: GmailInvoiceCandidate[], suppliers: SupplierInput[]) {
  if (!candidates?.length) {
    return NextResponse.json({ error: 'Missing candidates' }, { status: 400 })
  }
  if (!suppliers) {
    return NextResponse.json({ error: 'Missing suppliers' }, { status: 400 })
  }

  const gemini = getLLMClient('gemini')

  const supplierList = suppliers.map((s) =>
    `[${s.id}] ${s.name} | ${s.bankCardAliases.join(', ')}`
  ).join('\n')

  const candidateList = candidates.map((c, i) =>
    `[${i}] מאת: ${c.from}\n    נושא: ${c.subject}\n    תאריך: ${c.date}\n    תקציר: ${c.snippet}`
  ).join('\n\n')

  const result = await gemini.chat({
    system: `אתה מומחה בזיהוי ספקים מהודעות מייל של חשבוניות/קבלות, והתאמתן לרשימת ספקים קיימת במערכת הנהלת חשבונות.

כללים:
- שם הספק בשולח המייל לרוב מופיע בצורה שונה מהתיאור בכרטיס אשראי/בנק. דוגמאות התאמה:
  וואי-פיי = YPAY, שופרסל = SHUFERSAL, הוט מובייל = HOT MOBILE, גוגל = Google Play,
  VERCEL INC. = Vercel Inc., OPENAI *CHATGPT = OpenAI, GOOGLE *ONE = Google,
  GOOGLE*CLOUD ... = Google Cloud Platform, CLAUDE.AI = Anthropic, AWS / AMAZON WEB = Amazon,
  STRIPE = Stripe, MICROSOFT *... = Microsoft.
- ההתאמה היא סמנטית, לא מחרוזתית — "Google Cloud Platform" (שם ספק) מול "GOOGLE*CLOUD 4QZ73M"
  (כינוי בנק) יכולה להיות התאמה חזקה למרות דמיון מחרוזתי נמוך.
- עבור כל הודעת מייל, קבע פעולה אחת:
  - "link-existing": הספק בהודעה תואם לספק קיים ברשימה (החזר matchedSupplierId עם ה-id שלו).
  - "create-new": ההודעה היא בבירור חשבונית/קבלה מספק אמיתי שאינו ברשימה.
  - "no-match": ההודעה כלל אינה חשבונית/קבלה (עדכון, ניוזלטר, אישור הרשמה וכו') — דלג עליה.
- אם אינך בטוח בין create-new ל-no-match, העדף no-match.

רשימת הספקים הקיימים (מזהה, שם, כינויים בבנק/כרטיס):
${supplierList || '(אין ספקים קיימים במערכת)'}

חשוב: אל תחשוב בקול רם ואל תסביר את תהליך ההחלטה שלך בטקסט חופשי. החזר אך ורק
מערך JSON תקין — שום טקסט לפני או אחרי, שום markdown code fence — עם רשומה
אחת לכל הודעה, לפי הסדר, בפורמט:
[
  {
    "candidateIndex": <מספר>,
    "action": "link-existing" | "create-new" | "no-match",
    "matchedSupplierId": <מספר או null>,
    "confidence": "high" | "medium" | "low",
    "reasoning": "<הסבר קצר, משפט אחד בלבד>",
    "proposedName": "<שם ספק מוצע, רק כאשר action הוא create-new, אחרת null>"
  },
  ...
]`,
    messages: [{
      role: 'user',
      content: `הודעות מייל לסיווג:\n\n${candidateList}`,
    }],
    maxTokens: 8192,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  let parsed: SupplierMatchLLMEntry[]
  try {
    parsed = parseClaudeJson<SupplierMatchLLMEntry[]>(result.text)
  } catch (parseErr) {
    console.error('[match-receipt] Failed to parse match-supplier response. Raw text (first 800 chars):', result.text.slice(0, 800))
    console.error('[match-receipt] Parse error:', parseErr)
    return NextResponse.json({ error: 'Failed to parse LLM response', raw: result.text }, { status: 502 })
  }

  const supplierById = new Map(suppliers.map((s) => [s.id, s]))

  const proposals: SupplierMatchProposal[] = parsed
    .map((entry): SupplierMatchProposal | null => {
      const candidate = candidates[entry.candidateIndex]
      if (!candidate) return null

      const matchedSupplier = entry.matchedSupplierId != null ? supplierById.get(entry.matchedSupplierId) : undefined

      return {
        id: candidate.messageId,
        candidate,
        action: entry.action,
        matchedSupplierId: matchedSupplier?.id,
        matchedSupplierName: matchedSupplier?.name,
        proposedName: entry.action === 'create-new' ? (entry.proposedName || guessVendorName(candidate)) : undefined,
        confidence: entry.confidence || 'low',
        reasoning: entry.reasoning || '',
      }
    })
    .filter((p): p is SupplierMatchProposal => p !== null)

  return NextResponse.json({ proposals })
}

/** Best-effort vendor-name guess from an email's From/Subject when the LLM didn't propose one. */
function guessVendorName(candidate: GmailInvoiceCandidate): string {
  const displayName = candidate.from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim()
  return displayName || candidate.from.trim() || candidate.subject.trim()
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
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: `אתה מומחה לחילוץ נתונים מקבלות וחשבוניות ישראליות שנשלחו במייל.
חלץ את השדות הבאים והחזר JSON בלבד, ללא markdown, ללא הסברים.

השדות:
- vendor: שם העסק / ספק
- documentTitle: כותרת המסמך (לדוגמה: "חשבונית מס / קבלה 12345", "אישור הזמנה" וכו')
- date: תאריך בפורמט DD/MM/YYYY
- amount: סכום כולל (מספר)
- currency: מטבע ("ILS" / "USD" / "EUR" וכו', אם זוהה)
- vatAmount: סכום מע״מ אם מופיע (מספר או null)
- description: תיאור קצר של הפריטים / השירות
- invoiceNumber: מספר חשבונית / קבלה (מחרוזת או null)
- externalTxRef: מזהה העסקה / המסמך של הספק עצמו אם קיים (מחרוזת או null)
- referenceNumber: מספר אסמכתא / reference של חברת האשראי או המעבד אם קיים (מחרוזת או null)
- docType: אחד מהערכים "invoice" | "receipt" | "receipt-invoice" | "unknown"; אם אינך בטוח בסיווג, החזר "unknown"; אם השדה לא רלוונטי כלל, החזר null
- documentUrl: קישור למסמך/קבלה/חשבונית אם יש (URL מלא או null)
- matchesTransaction: האם הקבלה הזו אכן שייכת לעסקה הבנקאית שצוינה למטה? (true/false)
- matchReason: משפט קצר המסביר את ההחלטה

כללי התאמה ל-matchesTransaction:
- שם הספק במייל צריך להופיע (במלואו או חלקי) בתיאור העסקה (או להפך) — נורמליזציה: VERCEL INC. = Vercel Inc., OPENAI *CHATGPT = OpenAI.
- התאריך של הקבלה צריך להיות עד 10 ימים סביב תאריך העסקה.
- הסכום עשוי להיות במטבע אחר (USD/EUR) כאשר הספק זר — אל תפסול קבלה רק כי הסכום שונה.
- במקרה של ספק זר (Vercel, OpenAI, Google, AWS, Stripe וכו') — התאמת ספק + תאריך מספיקה.

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
    return claudeErrorResponse(response.status, errorBody)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    return NextResponse.json(parseClaudeJson(text))
  } catch (parseErr) {
    console.error('[match-receipt] Failed to parse extract response. Raw text (first 800 chars):', text.slice(0, 800))
    console.error('[match-receipt] Parse error:', parseErr)
    return NextResponse.json({ error: 'Failed to parse extraction response', raw: text }, { status: 502 })
  }
}

async function handleDownloadPdf(url: string) {
  if (!url) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 })
  }

  // Stripe's /invoice/.../pdf?s=em returns an HTML viewer page, not the PDF.
  // We try a series of URL variants — original first, then stripped query,
  // then known query swaps — and accept the first one that returns binary.
  const variants = [url]
  try {
    const u = new URL(url)
    if (u.search) {
      const noQuery = `${u.origin}${u.pathname}`
      variants.push(noQuery)
      // Stripe accepts ?s=ap (api source) and a few others; the API-source
      // variant tends to bypass the hosted-page viewer.
      variants.push(`${noQuery}?s=ap`)
    }
  } catch { /* malformed URL — let the original fetch surface the error */ }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/pdf,application/octet-stream,*/*',
    'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
  }

  let response: Response | null = null
  let triedUrls: string[] = []
  for (const v of variants) {
    triedUrls.push(v)
    const r = await fetch(v, { redirect: 'follow', headers: browserHeaders })
    if (!r.ok) {
      console.error('[match-receipt] PDF variant non-OK:', r.status, v)
      continue
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    if (ct.startsWith('text/html')) {
      console.error('[match-receipt] PDF variant returned HTML viewer (not the PDF):', v)
      continue
    }
    // Accept anything that's not HTML — typically application/pdf or octet-stream.
    response = r
    break
  }

  if (!response) {
    return NextResponse.json({ error: `Download failed: no PDF after ${triedUrls.length} variants`, triedUrls }, { status: 502 })
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
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: `אתה מומחה לחילוץ נתונים מקבלות וחשבוניות ישראליות.
חלץ את השדות הבאים והחזר JSON בלבד, ללא markdown, ללא הסברים.

השדות:
- vendor: שם העסק / ספק
- documentTitle: כותרת המסמך
- date: תאריך בפורמט DD/MM/YYYY
- amount: סכום כולל (מספר)
- currency: מטבע ("ILS" / "USD" / "EUR" וכו')
- vatAmount: סכום מע״מ אם מופיע (מספר או null)
- description: תיאור קצר של הפריטים / השירות
- invoiceNumber: מספר חשבונית / קבלה (מחרוזת או null)
- externalTxRef: מזהה העסקה / המסמך של הספק עצמו אם קיים (מחרוזת או null)
- referenceNumber: מספר אסמכתא / reference של חברת האשראי או המעבד אם קיים (מחרוזת או null)
- docType: אחד מהערכים "invoice" | "receipt" | "receipt-invoice" | "unknown"; אם אינך בטוח בסיווג, החזר "unknown"; אם השדה לא רלוונטי כלל, החזר null
- matchesTransaction: האם המסמך הזה אכן שייך לעסקה הבנקאית שצוינה למטה? (true/false)
- matchReason: משפט קצר המסביר את ההחלטה

כללי התאמה ל-matchesTransaction:
- שם הספק במסמך צריך להופיע (במלואו או חלקי) בתיאור העסקה (או להפך).
- התאריך של הקבלה צריך להיות עד 10 ימים סביב תאריך העסקה.
- הסכום עשוי להיות במטבע אחר (USD/EUR) — אל תפסול קבלה רק כי הסכום שונה.

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
    return claudeErrorResponse(response.status, errorBody)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const parsed = parseClaudeJson(text)
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
      model: 'claude-sonnet-5',
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
- externalTxRef: מזהה העסקה / המסמך של הספק עצמו אם קיים (מחרוזת או null)
- referenceNumber: מספר אסמכתא / reference של חברת האשראי או המעבד אם קיים (מחרוזת או null)
- docType: אחד מהערכים "invoice" | "receipt" | "receipt-invoice" | "unknown"; אם אינך בטוח בסיווג, החזר "unknown"; אם השדה לא רלוונטי כלל, החזר null

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
    const parsed = parseClaudeJson(text)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse extraction response', raw: text }, { status: 502 })
  }
}

/**
 * Extract fields from an Israeli VAT payment confirmation (אישור תשלום מע״מ).
 * Accepts PDF (preferred) or image. Used by the VAT section's payment-upload flow.
 */
async function handleExtractVatPayment(payloadBase64: string, mediaType: string | undefined, claudeApiKey?: string) {
  if (!payloadBase64) {
    return NextResponse.json({ error: 'Missing pdfBase64' }, { status: 400 })
  }
  if (!claudeApiKey) {
    return NextResponse.json({ error: 'Missing Claude API key' }, { status: 400 })
  }

  const isPdf = !mediaType || mediaType === 'application/pdf'
  const docPart = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf', data: payloadBase64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/webp', data: payloadBase64 } }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: `אתה מומחה לחילוץ נתונים מאישור תשלום מע״מ של רשות המסים בישראל.
חלץ את השדות הבאים והחזר JSON בלבד, ללא markdown, ללא הסברים.

השדות:
- periodLabel: תיאור התקופה כפי שכתוב במסמך (לדוגמה "מרץ-אפריל 2026", "אפריל 2026")
- periodStart: תאריך תחילת התקופה בפורמט YYYY-MM-DD
- periodEnd: תאריך סוף התקופה בפורמט YYYY-MM-DD
- paymentDate: תאריך התשלום בפורמט YYYY-MM-DD
- output: סך מס עסקאות (מספר)
- input: סך מס תשומות (מספר)
- net: סכום ששולם (חיובי) או חזר (שלילי)
- confirmationNumber: מספר אסמכתא / קבלה (מחרוזת או null)

החזר אך ורק JSON תקין.`,
      messages: [{
        role: 'user',
        content: [
          docPart,
          { type: 'text', text: 'חלץ נתוני אישור תשלום מע״מ מהמסמך המצורף.' },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[match-receipt] Claude VAT-payment extract error:', response.status, errorBody)
    return NextResponse.json({ error: `Claude API error: ${response.status}` }, { status: response.status })
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''
  try {
    return NextResponse.json(parseClaudeJson(text))
  } catch (parseErr) {
    console.error('[match-receipt] Failed to parse VAT payment extract. Raw:', text.slice(0, 800), 'err:', parseErr)
    return NextResponse.json({ error: 'Failed to parse extraction response', raw: text }, { status: 502 })
  }
}
