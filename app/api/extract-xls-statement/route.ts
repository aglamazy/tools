// PUBLIC ROUTE — converts an XLS/XLSX financial statement to normalized structured
// transactions via Gemini structured-output. No user auth required; uses the server's
// included Gemini key (NEXT_PUBLIC_GEMINI_API_KEY), same model policy as
// /api/extract-pdf-statement. The caller passes the file as base64.
//
// Unlike the PDF route, the sheet is first converted to TSV text (numbers arrive as
// plain text, no OCR needed), so gemini-2.5-flash is sufficient and cheaper.
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import type { XlsExtraction } from '@/app/types/xlsExtraction'

const SYSTEM_PROMPT = `אתה מומחה בקריאת דפי בנק ופירוטי כרטיסי אשראי מכל הבנקים בישראל ובעולם.
קיבלת גיליון אקסל (בפורמט TSV) המכיל תנועות פיננסיות.

מטרה: חלץ את כל העסקאות בצורה מנורמלת ומובנית, ללא תלות בפורמט הספציפי של הבנק.

הוראות:
1. זהה: דף בנק (kind="bank") או פירוט אשראי (kind="credit")
2. תאריכים: המר תמיד ל-YYYY-MM-DD (גם אם הקובץ מכיל DD/MM/YYYY, DD.MM.YYYY וכו')
3. תיאורים: צמצם רווחים מרובים לרווח בודד; הסר רווחים מובילים ונגררים
4. סכומים: שלילי = יציאת כסף (חיוב/הוצאה); חיובי = כניסת כסף (זכות/הכנסה)
5. אל תכלול שורות סיכום ("סה"כ", "יתרת פתיחה", "סך הכל", "כולל" ושורות דומות) — רק עסקאות אמיתיות

עבור דף בנק:
- accountNumber: מספר חשבון (תבנית XXX-XXXXXX אם ישראלי, כל פורמט אחר אם זר)
- processingMonth: MM/YYYY של הפעילות
- לכל שורה: date (YYYY-MM-DD), description (תיאור מנורמל), amount (שלילי=חיוב, חיובי=זכות), balance (יתרה), reference (אסמכתא), currency (ברירת מחדל ILS)
- isCreditCardCharge: true אם התיאור מציין חיוב כרטיס אשראי (לדוג׳ "1234 - ישראכרט", "ויזה", "מאסטרקארד", "VISA" וכו׳)
- cardNumber: 4 ספרות אחרונות של הכרטיס אם isCreditCardCharge=true

עבור פירוט אשראי:
- cardNumber: 4 ספרות אחרונות של הכרטיס
- billingDate: תאריך החיוב (YYYY-MM-DD)
- processingMonth: MM/YYYY של החיוב
- לכל שורה: date (תאריך עסקה YYYY-MM-DD), merchant (שם עסק מנורמל), amount (שלילי=עסקה), totalAmount (סכום כולל לתשלומים; שווה ל-amount אם תשלום אחד), currentStep (מספר תשלום נוכחי), totalSteps (סה"כ תשלומים), currency

issuer: זהה אם ניתן: fibi / leumi / discount / mizrahi / hapoalim / max / cal / isracredit / amex / other

החזר JSON תקין בלבד, ללא markdown, ללא הסברים.`

const GEMINI_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['bank', 'credit'] },
    accountNumber: { type: 'string', nullable: true },
    cardNumber: { type: 'string', nullable: true },
    billingDate: { type: 'string', nullable: true },
    processingMonth: { type: 'string', nullable: true },
    issuer: { type: 'string', nullable: true },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          merchant: { type: 'string', nullable: true },
          amount: { type: 'number', nullable: true },
          balance: { type: 'number', nullable: true },
          reference: { type: 'string', nullable: true },
          currency: { type: 'string', nullable: true },
          isCreditCardCharge: { type: 'boolean', nullable: true },
          cardNumber: { type: 'string', nullable: true },
          currentStep: { type: 'number', nullable: true },
          totalSteps: { type: 'number', nullable: true },
          totalAmount: { type: 'number', nullable: true },
        },
      },
    },
  },
  required: ['kind', 'transactions'],
}

// Use Flash for XLS text extraction — numbers arrive as plain text (no visual OCR),
// so Flash accuracy is sufficient. Pro is reserved for PDF where OCR reliability matters.
const GEMINI_MODEL = 'gemini-2.5-flash'

function xlsToText(base64: string): string {
  const buffer = Buffer.from(base64, 'base64')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sections: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet || !sheet['!ref']) continue
    const tsv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' })
    const trimmed = tsv.trim()
    if (trimmed) {
      sections.push(`=== גיליון: ${sheetName} ===\n${trimmed}`)
    }
  }

  return sections.join('\n\n')
}

async function extractViaGemini(tableText: string, geminiApiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${geminiApiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: tableText }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 32000,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_SCHEMA,
      },
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    console.error('[extract-xls-statement] Gemini API error:', res.status, errorBody)
    throw new Error(`Gemini API error: ${res.status}`)
  }

  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts
  return Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text ?? '').join('') : ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { xlsBase64, hint } = body as { xlsBase64?: string; hint?: 'bank' | 'credit' }

    if (!xlsBase64) {
      return NextResponse.json({ error: 'Missing xlsBase64' }, { status: 400 })
    }

    const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'XLS extraction unavailable — Gemini key not configured.' }, { status: 400 })
    }

    let tableText: string
    try {
      tableText = xlsToText(xlsBase64)
    } catch (err) {
      console.error('[extract-xls-statement] XLSX parse error:', err)
      return NextResponse.json({ error: 'Failed to read XLS/XLSX file' }, { status: 422 })
    }

    if (!tableText.trim()) {
      return NextResponse.json({ error: 'XLS file appears to be empty' }, { status: 422 })
    }

    const hintSuffix = hint ? `\nסוג מסמך צפוי: ${hint === 'bank' ? 'דף בנק' : 'פירוט אשראי'}.` : ''
    const userMessage = `חלץ את הנתונים הפיננסיים מהגיליון הבא:${hintSuffix}\n\n${tableText}`

    const text = await extractViaGemini(userMessage, geminiApiKey)
    console.log(`[extract-xls-statement] extracted via gemini, ${text.length} chars`)

    let extraction: XlsExtraction
    try {
      const noFence = text.replace(/```json?\s*/gi, '').replace(/```/g, '')
      const firstBrace = noFence.indexOf('{')
      const lastBrace = noFence.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('no JSON object found in response')
      }
      extraction = JSON.parse(noFence.slice(firstBrace, lastBrace + 1)) as XlsExtraction
    } catch {
      return NextResponse.json({ error: 'Failed to parse extraction response', raw: text }, { status: 502 })
    }

    if (extraction.kind !== 'bank' && extraction.kind !== 'credit') {
      return NextResponse.json(
        { error: 'המסמך אינו דף בנק או פירוט כרטיס אשראי — אנא בדוק את הקובץ שהועלה.', raw: extraction },
        { status: 422 },
      )
    }

    return NextResponse.json(extraction)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
