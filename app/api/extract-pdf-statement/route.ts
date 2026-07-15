// CALLER-KEYED ROUTE — extracts financial-statement data from a PDF and returns rows shaped like an
// XLSX export, so the existing classifier/parsers consume them unchanged.
//
import { NextRequest, NextResponse } from 'next/server'
import { withServiceCall } from 'agents-observe/next'
import { extractJsonWithFallback } from '@/app/services/llm/extractionLadder'
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

const GEMINI_PDF_MODEL = 'gemini-2.5-pro'

async function handler(req: NextRequest) {
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

    const userMessage = exampleContext
      ? `להלן דוגמה לחילוץ שבוצע בהצלחה עבור עמוד קודם באותו מסמך, כדי שתבין את מבנה העמודות (איזה סכום הוא debit ואיזה credit, ואיך יתרה מתעדכנת):
${exampleContext}

כעת חלץ את הנתונים מהעמוד/ים המצורפים (המשך אותו מסמך — ללא כותרות עמודות משלהם, אבל אותו מבנה עמודות בדיוק). אל תכלול את השורות מהדוגמה למעלה — הן כבר חולצו קודם.`
: hint
      ? `סוג צפוי: ${hint === 'bank' ? 'דף בנק' : 'פירוט אשראי'}. חלץ את הנתונים.`
      : 'חלץ את הנתונים מהמסמך.'

    const result = await extractJsonWithFallback<Extraction>({
      routeName: 'extract-pdf-statement',
      systemPrompt: SYSTEM_PROMPT,
      userParts: [
        { type: 'document', data: pdfBase64 },
        { type: 'text', text: userMessage },
      ],
      geminiModel: GEMINI_PDF_MODEL,
      geminiMaxTokens: 16000,
      geminiTemperature: 0,
      geminiResponseSchema: GEMINI_RESPONSE_SCHEMA,
      anthropicModel: 'claude-sonnet-5',
      anthropicMaxTokens: 16000,
      validate: (extraction) => {
        if (extraction.kind !== 'bank' && extraction.kind !== 'credit') {
          return 'המסמך אינו דף בנק או פירוט כרטיס אשראי — אנא בדוק את הקובץ שהועלה.'
        }
        const zeroAmountRows = findZeroAmountRows(extraction)
        if (zeroAmountRows.length > 0) {
          return `החילוץ הניב ${zeroAmountRows.length} שורות עם סכום 0 מתוך ${extraction.rows.length} — ככל הנראה המסמך גדול מדי לחילוץ במכה אחת. פצל את הקובץ לחלקים קטנים יותר ונסה שוב.`
        }
        return null
      },
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          provider: result.provider,
          providerError: result.providerError ?? true,
          details: result.details,
          raw: result.raw,
        },
        { status: result.status ?? 422 },
      )
    }

    const extraction = result.data
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

export const POST = withServiceCall((req, ...args) => handler(req as NextRequest, ...args as []))
