// CALLER-KEYED ROUTE — uses caller's Claude API key to extract financial-statement data from a PDF
// and return rows shaped like an XLSX export, so the existing classifier/parsers consume them unchanged.
import { NextRequest, NextResponse } from 'next/server'

type ExtractedRow = {
  date?: string | null
  merchant?: string | null
  description?: string | null
  txAmount?: number | null
  billAmount?: number | null
  debit?: number | null
  credit?: number | null
  balance?: number | null
  reference?: string | null
  detail?: string | null
}

type Extraction = {
  kind: 'bank' | 'credit'
  accountNumber?: string | null
  cardNumber?: string | null
  billingDate?: string | null
  processingMonth?: string | null
  rows: ExtractedRow[]
}

const SYSTEM_PROMPT = `אתה מומחה בקריאת דפי בנק וכרטיסי אשראי ישראליים מקובץ PDF.
המסמך הוא או דף תנועות בחשבון בנק, או פירוט עסקאות בכרטיס אשראי לחודש מסוים.

מטרתך: לחלץ את כל הנתונים בצורה מובנית כדי שניתן לייבא אותם למערכת תקציב.

הוראות:
1. זהה האם זה דף בנק (kind="bank") או פירוט אשראי (kind="credit").
2. עבור דף בנק: חלץ accountNumber (תבנית XXX-XXXXXX), processingMonth (MM/YYYY), ולכל שורה — date (DD/MM/YYYY), description, debit, credit, balance, reference (אסמכתא).
3. עבור דף אשראי: חלץ cardNumber (4 ספרות אחרונות), billingDate (DD/MM/YYYY של מועד החיוב), ולכל שורה — date (DD/MM/YYYY), merchant, txAmount (סכום עסקה), billAmount (סכום חיוב — הסכום שמחויב החודש), detail (פירוט / תשלומים / זיכוי).
4. אל תכלול שורות סיכום ("סה\"כ", "יתרת פתיחה" וכו'); רק עסקאות אמיתיות.
5. סכומים חיוביים = חיוב; סכומי זיכוי = שליליים. שמור את הסימן.
6. החזר אך ורק JSON תקין, ללא markdown, ללא הסברים.

מבנה ה-JSON:
{
  "kind": "bank" | "credit",
  "accountNumber": "316-211362" או null,
  "cardNumber": "1473" או null,
  "billingDate": "10/04/2026" או null,
  "processingMonth": "04/2026" או null,
  "rows": [
    { "date": "DD/MM/YYYY", "description": "...", "debit": 0, "credit": 100.50, "balance": 12345.67, "reference": "..." },
    { "date": "DD/MM/YYYY", "merchant": "...", "txAmount": 150.00, "billAmount": 150.00, "detail": "תשלום 1 מתוך 3" }
  ]
}

בכל שורה כלול רק את השדות הרלוונטיים לסוג המסמך.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pdfBase64, claudeApiKey, hint } = body as {
      pdfBase64?: string
      claudeApiKey?: string
      hint?: 'bank' | 'credit'
    }

    if (!pdfBase64) {
      return NextResponse.json({ error: 'Missing pdfBase64' }, { status: 400 })
    }
    if (!claudeApiKey) {
      return NextResponse.json({ error: 'Missing Claude API key' }, { status: 400 })
    }

    const userMessage = hint
      ? `סוג צפוי: ${hint === 'bank' ? 'דף בנק' : 'פירוט אשראי'}. חלץ את הנתונים.`
      : 'חלץ את הנתונים מהמסמך.'

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: userMessage },
          ],
        }],
      }),
    })

    if (!claudeResponse.ok) {
      const errorBody = await claudeResponse.text()
      console.error('[extract-pdf-statement] Claude API error:', claudeResponse.status, errorBody)
      return NextResponse.json({ error: `Claude API error: ${claudeResponse.status}` }, { status: claudeResponse.status })
    }

    const data = await claudeResponse.json()
    const text: string = data.content?.[0]?.text ?? ''

    let extraction: Extraction
    try {
      // The LLM sometimes wraps JSON in a ```json fence and/or prepends a
      // Hebrew prose preamble (e.g. "זהו — המסמך אינו דף בנק...") explaining
      // its reasoning. Strip the fence first, then extract the first balanced
      // {...} block — tolerant of any prose around it.
      const noFence = text.replace(/```json?\s*/gi, '').replace(/```/g, '')
      const firstBrace = noFence.indexOf('{')
      const lastBrace = noFence.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('no JSON object found in response')
      }
      extraction = JSON.parse(noFence.slice(firstBrace, lastBrace + 1)) as Extraction
    } catch {
      return NextResponse.json({ error: 'Failed to parse extraction response', raw: text }, { status: 502 })
    }

    if (extraction.kind !== 'bank' && extraction.kind !== 'credit') {
      // The LLM returned valid JSON but classified the document as neither a
      // bank statement nor a credit-card bill (kind=null). Surface a clear
      // user-facing reason instead of "Invalid kind" — most likely the
      // uploaded PDF was a T&C / contract / unrelated doc.
      return NextResponse.json(
        {
          error: 'המסמך אינו דף בנק או פירוט כרטיס אשראי — אנא בדוק את הקובץ שהועלה.',
          raw: extraction,
        },
        { status: 422 },
      )
    }

    const rows = toSheetRows(extraction)
    return NextResponse.json({
      kind: extraction.kind,
      accountNumber: extraction.accountNumber ?? null,
      cardNumber: extraction.cardNumber ?? null,
      billingDate: extraction.billingDate ?? null,
      processingMonth: extraction.processingMonth ?? null,
      rows,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Build a SheetRow[] (array of cell arrays) that mirrors the shape produced by readExcelFile.
 * Headers and identifying rows match what an XLSX export from FIBI / Otsar HaHayal would contain,
 * so the existing fileClassifier + bank/credit parsers consume the rows without modification.
 */
function toSheetRows(e: Extraction): Array<Array<string | number | null>> {
  if (e.kind === 'credit') {
    return creditRows(e)
  }
  return bankRows(e)
}

function creditRows(e: Extraction): Array<Array<string | number | null>> {
  const rows: Array<Array<string | number | null>> = []
  const card = e.cardNumber ?? ''
  const billing = e.billingDate ?? ''
  if (card || billing) {
    rows.push([`כרטיס:${card} - ישראכרט חודש החיוב: ${billing}`])
  }
  if (billing) {
    rows.push([`עסקאות בשקלים חיוב בתאריך ${billing}`])
  }
  rows.push(['תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'סכום חיוב', 'פירוט'])
  for (const r of e.rows) {
    if (!r.date) continue
    rows.push([
      r.date,
      r.merchant ?? '',
      r.txAmount ?? r.billAmount ?? 0,
      r.billAmount ?? r.txAmount ?? 0,
      r.detail ?? '',
    ])
  }
  return rows
}

function bankRows(e: Extraction): Array<Array<string | number | null>> {
  const rows: Array<Array<string | number | null>> = []
  const acct = e.accountNumber ?? ''
  const month = e.processingMonth ?? ''
  if (acct) rows.push([`חשבון ${acct}`])
  if (month) rows.push([`חודש: ${month}`])
  rows.push(['תאריך', 'תאריך ערך', 'תיאור', 'אסמכתא', 'חובה', 'זכות', 'יתרה'])
  for (const r of e.rows) {
    if (!r.date) continue
    rows.push([
      r.date,
      '',
      r.description ?? '',
      r.reference ?? '',
      r.debit ?? 0,
      r.credit ?? 0,
      r.balance ?? 0,
    ])
  }
  return rows
}
