// CALLER-KEYED ROUTE — extracts financial-statement data from a PDF and returns rows shaped like an
// XLSX export, so the existing classifier/parsers consume them unchanged.
//
// Provider: honors the project LLM contract (gemini = included default; anthropic = user opt-in).
// When the caller passes a Claude key we use Claude Sonnet; otherwise we fall back to Gemini on the
// app's included key (GEMINI_API_KEY) so PDF import works out-of-box with no user config.
import { NextRequest, NextResponse } from 'next/server'
import { toSheetRows, findZeroAmountRows, type Extraction } from '@/app/utils/pdfExtractionRows'

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

// Gemini native structured-output schema — forces clean JSON (no markdown fence / prose
// preamble like the bugs in #41/#46). OpenAPI subset that Gemini accepts.
const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['bank', 'credit'] },
    accountNumber: { type: 'string', nullable: true },
    cardNumber: { type: 'string', nullable: true },
    billingDate: { type: 'string', nullable: true },
    processingMonth: { type: 'string', nullable: true },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', nullable: true },
          merchant: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          txAmount: { type: 'number', nullable: true },
          billAmount: { type: 'number', nullable: true },
          debit: { type: 'number', nullable: true },
          credit: { type: 'number', nullable: true },
          balance: { type: 'number', nullable: true },
          reference: { type: 'string', nullable: true },
          detail: { type: 'string', nullable: true },
        },
      },
    },
  },
  required: ['kind', 'rows'],
}

// Gemini model for PDF extraction. Flash read the text columns but missed the numeric
// amount columns on dense Otsar/FIBI statements (every debit/credit/balance came back 0,
// with duplicated rows). Bank data must be exact, so we use Pro for reliable numeric OCR.
const GEMINI_PDF_MODEL = 'gemini-2.5-pro'

/** Call Gemini with the PDF inline + structured-output schema. Returns the raw JSON text. */
async function extractViaGemini(pdfBase64: string, userMessage: string, geminiApiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_PDF_MODEL)}:generateContent?key=${geminiApiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          { text: userMessage },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 16000,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  })
  if (!res.ok) {
    const errorBody = await res.text()
    console.error('[extract-pdf-statement] Gemini API error:', res.status, errorBody)
    throw new Error(`Gemini API error: ${res.status}`)
  }
  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts
  return Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text ?? '').join('') : ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pdfBase64, hint, exampleContext } = body as {
      pdfBase64?: string
      hint?: 'bank' | 'credit'
      // Few-shot context for a continuation chunk of a multi-chunk PDF (see
      // pdfReader.ts): a JSON blob built from an EARLIER chunk's own real
      // extraction (account/month + a few sample rows). Statement exports
      // print column headers only on the first page, never repeated on
      // continuation pages — a headerless chunk with no anchor at all
      // returns every amount as null (#251). Showing the model its own
      // prior-chunk mapping fixes that without re-sending the header page's
      // image on every call.
      exampleContext?: string
    }

    if (!pdfBase64) {
      return NextResponse.json({ error: 'Missing pdfBase64' }, { status: 400 })
    }

    // PDF statement extraction ALWAYS uses Gemini's structured-schema path
    // (responseSchema + temperature 0) — the reliable tool for "PDF → exact table",
    // and the contract default. A user's Claude key powers OTHER features (tax-doc
    // extraction), NOT this endpoint: Claude's free-form output here intermittently
    // omitted the bank header row → classifyFile → "unknown file type" (the bug
    // Agla hit on 211362-June.pdf despite having a Claude key).
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'חילוץ PDF לא זמין — לא הוגדר מפתח Gemini.' }, { status: 400 })
    }

    const userMessage = exampleContext
      ? `להלן דוגמה לחילוץ שבוצע בהצלחה עבור עמוד קודם באותו מסמך, כדי שתבין את מבנה העמודות (איזה סכום הוא debit ואיזה credit, ואיך יתרה מתעדכנת):
${exampleContext}

כעת חלץ את הנתונים מהעמוד/ים המצורפים (המשך אותו מסמך — ללא כותרות עמודות משלהם, אבל אותו מבנה עמודות בדיוק). אל תכלול את השורות מהדוגמה למעלה — הן כבר חולצו קודם.`
      : hint
      ? `סוג צפוי: ${hint === 'bank' ? 'דף בנק' : 'פירוט אשראי'}. חלץ את הנתונים.`
      : 'חלץ את הנתונים מהמסמך.'

    const text = await extractViaGemini(pdfBase64, userMessage, geminiApiKey)
    console.log(`[extract-pdf-statement] extracted via gemini, ${text.length} chars`)

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

    // Validate before accepting: a real transaction row can never have a
    // zero amount on both sides (debit+credit / txAmount+billAmount) — that
    // shape only happens when the model's response was truncated or
    // otherwise degenerate (e.g. a token-budget cutoff mid-document; see
    // #251/#252). Reject the WHOLE extraction rather than silently importing
    // zero-amount rows — a partial/damaged import is worse than none,
    // since it looks successful while corrupting the data.
    const zeroAmountRows = findZeroAmountRows(extraction)
    if (zeroAmountRows.length > 0) {
      return NextResponse.json(
        {
          error: `החילוץ הניב ${zeroAmountRows.length} שורות עם סכום 0 מתוך ${extraction.rows.length} — ככל הנראה המסמך גדול מדי לחילוץ במכה אחת. פצל את הקובץ לחלקים קטנים יותר ונסה שוב.`,
          zeroAmountCount: zeroAmountRows.length,
          totalCount: extraction.rows.length,
        },
        { status: 422 },
      )
    }

    // Return both the pre-built SheetRow shape (single-call callers use this
    // directly) and the raw extraction (kind/metadata/rows) — multi-chunk
    // callers (readPdfFile splitting a large PDF into page-range calls, #251)
    // merge several chunks' raw extractions before building SheetRows once,
    // since each chunk's own SheetRow conversion would duplicate header rows.
    const rows = toSheetRows(extraction)
    return NextResponse.json({
      kind: extraction.kind,
      accountNumber: extraction.accountNumber ?? null,
      cardNumber: extraction.cardNumber ?? null,
      billingDate: extraction.billingDate ?? null,
      processingMonth: extraction.processingMonth ?? null,
      rows,
      rawRows: extraction.rows,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
