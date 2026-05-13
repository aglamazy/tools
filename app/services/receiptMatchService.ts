/**
 * Receipt matching service — finds and extracts receipt data from Gmail emails.
 * Extracted from ExpenseTab to keep the component under the line limit.
 */
import { db, type ExpenseDocument } from '@/app/db/financeDB'
import { searchMessages, fetchMessagesMetadata, fetchMessageBody, fetchFirstPdfAttachment } from '@/app/services/gmailService'
import { uploadExpenseDocument } from '@/app/services/googleDriveService'

/**
 * Parse a transaction date string in any of the formats we store:
 *   - DD/MM/YYYY or DD.MM.YYYY (Israeli — older imports)
 *   - YYYY-MM-DD (ISO — newer imports)
 *   - DD/MM/YY (2-digit year — legacy)
 * Returns the calendar-correct year / month (1–12) / day.
 */
function parseTxDate(dateStr: string): { year: number; month: number; day: number } {
  // ISO YYYY-MM-DD
  const iso = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
  // Israeli D[D]/M[M]/YYYY or D[D].M[M].YYYY (with 2- or 4-digit year)
  const parts = dateStr.split(/[/.]/)
  if (parts.length !== 3) {
    throw new Error(`Unrecognized transaction date format: "${dateStr}"`)
  }
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const rawYear = parts[2]
  const year = rawYear.length === 2 ? 2000 + parseInt(rawYear, 10) : parseInt(rawYear, 10)
  return { year, month, day }
}

function parseDateFolder(dateStr: string): { year: string; month: string } {
  const { year, month } = parseTxDate(dateStr)
  return { year: String(year), month: String(month).padStart(2, '0') }
}

function buildDateRange(dateStr: string): string {
  const { year, month, day } = parseTxDate(dateStr)
  const txDate = new Date(year, month - 1, day)
  const after = new Date(txDate)
  after.setDate(after.getDate() - 3)
  const before = new Date(txDate)
  before.setDate(before.getDate() + 14)
  const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return `after:${fmt(after)} before:${fmt(before)}`
}

export type MatchResult =
  | { status: 'matched'; doc: ExpenseDocument }
  | { status: 'no-match' }
  | { status: 'error' }

/**
 * Search Gmail for a receipt matching the transaction, extract data, upload to Drive.
 */
/**
 * Build vendor search tokens from a transaction description.
 * Strips noise (*, #, ., spaces, digits, common suffixes), keeps tokens ≥ 3 chars.
 * Example: "OPENAI *CHATGPT SUBS" → ["OPENAI", "CHATGPT", "SUBS"]
 *          "VERCEL INC." → ["VERCEL"]    ("INC" is in the suffix stop-list)
 */
const VENDOR_STOPWORDS = new Set([
  'INC', 'LTD', 'LLC', 'CORP', 'CO', 'AB', 'GMBH', 'BV', 'SRL', 'SA', 'SAS',
  'COM', 'WWW', 'PAY', 'SUB', 'SUBS', 'SUBSCRIPTION',
])

/**
 * Senders that ship a "view document" CTA link instead of a PDF attachment.
 * For these we persist the external URL on the ExpenseDocument and let the UI
 * render an "open invoice" link — no PDF download attempt, no Drive copy.
 * The matcher would otherwise silently skip these emails (no attachment +
 * the URL points to a viewer that requires a logged-in session).
 */
const URL_ONLY_INVOICE_SENDERS = [
  'no-reply@ypay.co.il',
]

function isUrlOnlyInvoiceSender(fromHeader: string | undefined): boolean {
  if (!fromHeader) return false
  const lower = fromHeader.toLowerCase()
  return URL_ONLY_INVOICE_SENDERS.some(addr => lower.includes(addr))
}

/**
 * Extract a "view document" CTA URL from an HTML email body.
 * Prefers anchors whose visible text matches the Hebrew button label, then
 * falls back to the first https URL in any anchor's href. Returns null when
 * nothing usable is found.
 */
function extractCtaUrlFromHtml(html: string): string | null {
  if (!html) return null
  // Match <a ... href="..."> ... text ... </a>. The text content is checked
  // against the canonical Hebrew button label first.
  const anchorRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const fallbacks: string[] = []
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1]
    const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
    if (!href.startsWith('http')) continue
    // Hebrew "לצפייה במסמך" is the YPAY button; allow loose match in case of
    // surrounding whitespace / minor wording differences.
    if (/לצפייה\s+במסמך/.test(text)) return href
    fallbacks.push(href)
  }
  // Fallback: any https link that looks invoice-shaped (skip tracking pixels
  // and the "join YPAY" CTA in the same email).
  for (const href of fallbacks) {
    if (/register|signup|join|unsubscribe/i.test(href)) continue
    return href
  }
  return null
}
function extractVendorTokens(desc: string): string[] {
  return desc
    .split(/[\s*.#,/\\]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3)
    .filter(t => !/^\d+$/.test(t))
    .filter(t => !VENDOR_STOPWORDS.has(t.toUpperCase()))
    .slice(0, 3)
}

export async function matchReceiptForTransaction(
  tx: { id: number; date: string; description: string; merchant?: string; amount: number },
  claudeApiKey: string,
): Promise<MatchResult> {
  const desc = (tx.merchant || tx.description || '').trim()
  const dateRange = buildDateRange(tx.date)
  const log = (...args: unknown[]) => console.log('[match]', `tx#${tx.id}`, desc, '·', ...args)

  log('start', { date: tx.date, amount: tx.amount, dateRange })

  // Vendor-name + receipt-keyword search. The description IS the vendor name,
  // but a vendor's mail volume can include non-invoice notifications, so we
  // bias the query toward receipt-shaped messages. We collect a small set of
  // candidates and try them one-by-one — Claude verification filters out the
  // ones that aren't actually invoices (e.g. share-link notifications).
  let candidateMessageIds: string[] = []
  const tokens = extractVendorTokens(desc)
  if (tokens.length > 0) {
    const receiptKeywords = '(receipt OR invoice OR חשבונית OR קבלה)'
    const narrowQuery = `${tokens.join(' ')} ${receiptKeywords} ${dateRange}`
    log('vendor+receipt search · tokens:', tokens, '· query:', narrowQuery)
    const narrow = await searchMessages(narrowQuery, { searchAllMail: true, maxResults: 5 })
    log('vendor+receipt search →', { count: narrow.messageIds.length, error: narrow.error })
    candidateMessageIds = narrow.messageIds.slice()

    // Fallback: if the receipt-keyword query missed it, broaden to vendor-only.
    if (candidateMessageIds.length === 0) {
      const broadVendorQuery = `${tokens.join(' ')} ${dateRange}`
      log('vendor-only search · query:', broadVendorQuery)
      const broad = await searchMessages(broadVendorQuery, { searchAllMail: true, maxResults: 5 })
      log('vendor-only search →', { count: broad.messageIds.length, error: broad.error })
      candidateMessageIds = broad.messageIds.slice()
    }
  } else {
    log('no vendor tokens extracted from description')
  }

  // If the vendor-name search yielded nothing, fall back to broad date-range
  // + Gemini disambig — same path as before, just appended to the candidate
  // list so we keep the verify-each-candidate loop unified.
  if (candidateMessageIds.length === 0) {
    const broadQuery = `${dateRange} (חשבונית OR קבלה OR receipt OR invoice)`
    log('llm fallback · broad query:', broadQuery)
    const searchResult = await searchMessages(broadQuery, { searchAllMail: true, maxResults: 30 })
    log('broad search →', { count: searchResult.messageIds.length, error: searchResult.error })
    if (searchResult.error) return { status: 'error' }
    if (searchResult.messageIds.length === 0) return { status: 'no-match' }

    const metaResult = await fetchMessagesMetadata(searchResult.messageIds.slice(0, 20))
    if (metaResult.error || metaResult.messages.length === 0) return { status: 'no-match' }

    const matchRes = await fetch('/api/match-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'match',
        transaction: { date: tx.date, description: desc, amount: tx.amount, merchant: tx.merchant },
        candidates: metaResult.messages,
      }),
    })
    const matchData = await matchRes.json()
    log('gemini match →', JSON.stringify(matchData))

    if (matchData.messageId) {
      candidateMessageIds = [matchData.messageId]
    } else if (matchData.senderHint) {
      const narrowQuery = `from:${matchData.senderHint} ${dateRange}`
      const narrowResult = await searchMessages(narrowQuery, { searchAllMail: true, maxResults: 5 })
      candidateMessageIds = narrowResult.messageIds.slice()
    }

    if (candidateMessageIds.length === 0) {
      log('no candidates after llm fallback — returning no-match')
      return { status: 'no-match' }
    }
  }

  // From here on we REQUIRE Claude: verification + extraction + storage.
  if (!claudeApiKey) {
    log('missing Claude API key — required for verification + extraction')
    return { status: 'error' }
  }

  // Try each candidate. The first one that Claude verifies AND produces a
  // downloadable PDF wins. Anything else (non-receipt, no PDF link, Claude
  // rejection, download failure) gets skipped silently and we move on.
  log('verifying candidates:', candidateMessageIds)
  for (const msgId of candidateMessageIds) {
    const doc = await tryCandidate(msgId, tx, desc, claudeApiKey, log)
    if (doc) return { status: 'matched', doc }
  }
  log('all candidates exhausted — returning no-match')
  return { status: 'no-match' }
}

/**
 * Try a single Gmail message as a receipt for the transaction. Returns the
 * stored ExpenseDocument on success, null on any skip-this-candidate reason.
 * Errors during PDF download / Drive upload count as skip — the caller may
 * still have other candidates to try.
 */
async function tryCandidate(
  msgId: string,
  tx: { id: number; date: string; description: string; merchant?: string; amount: number },
  desc: string,
  claudeApiKey: string,
  log: (...args: unknown[]) => void,
): Promise<ExpenseDocument | null> {
  log(`trying candidate ${msgId} ·`)

  // Fetch email body (also returns From header so we can apply sender-based routing)
  const bodyResult = await fetchMessageBody(msgId)
  if (bodyResult.error || !bodyResult.body) {
    log(`  ↳ body fetch failed: ${bodyResult.error || 'empty body'} — skip`)
    return null
  }

  // Claude verifies + extracts from the email body
  const extractRes = await fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'extract',
      emailBody: bodyResult.body,
      transaction: { date: tx.date, description: desc, amount: tx.amount },
      claudeApiKey,
    }),
  })
  const extracted = await extractRes.json()
  log('  ↳ email extract →', { vendor: extracted.vendor, matchesTransaction: extracted.matchesTransaction, matchReason: extracted.matchReason, documentUrl: !!extracted.documentUrl })

  if (extracted.error) {
    log(`  ↳ extract error: ${extracted.error} — skip`)
    return null
  }
  if (extracted.matchesTransaction === false) {
    log(`  ↳ claude rejected: ${extracted.matchReason} — skip`)
    return null
  }

  // URL-only invoice senders (e.g. YPAY): no PDF attachment — the email body
  // has a CTA button linking to the hosted document. Persist the URL and skip
  // the PDF/Drive flow entirely. UI renders an "open invoice" link.
  if (isUrlOnlyInvoiceSender(bodyResult.from)) {
    const ctaUrl = extracted.documentUrl || (bodyResult.contentType === 'html' ? extractCtaUrlFromHtml(bodyResult.body) : null)
    if (!ctaUrl) {
      log('  ↳ url-only sender but no CTA url found — skip')
      return null
    }
    log('  ↳ url-only invoice sender — saving externalUrl:', ctaUrl)
    return {
      transactionId: tx.id,
      fileName: extracted.documentTitle || extracted.vendor || 'invoice',
      vendor: extracted.vendor,
      amount: extracted.amount,
      vatAmount: extracted.vatAmount,
      date: extracted.date,
      description: extracted.documentTitle || extracted.description,
      externalUrl: ctaUrl,
      extractedData: extracted,
      sourceType: 'gmail',
      gmailMessageId: msgId,
      uploadedAt: new Date().toISOString(),
    }
  }
  // Prefer the email's actual PDF attachment when present — most receipts ship
  // the PDF attached, and that avoids Stripe-style URLs that serve an HTML
  // viewer page instead of the binary PDF.
  let pdfBase64: string | undefined
  let pdfContentType = 'application/pdf'
  let pdfFileName: string | undefined
  const attachment = await fetchFirstPdfAttachment(msgId)
  if (attachment) {
    log('  ↳ found PDF attachment:', attachment.filename, attachment.base64.length, 'b64chars')
    pdfBase64 = attachment.base64
    pdfContentType = attachment.mimeType
    pdfFileName = attachment.filename
  } else if (extracted.documentUrl) {
    log('  ↳ no attachment — trying documentUrl:', extracted.documentUrl)
    try {
      const dlRes = await fetch('/api/match-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download-pdf', url: extracted.documentUrl }),
      })
      const dlData = await dlRes.json()
      if (dlData.base64) {
        pdfBase64 = dlData.base64
        pdfContentType = dlData.contentType || 'application/pdf'
        pdfFileName = dlData.fileName
      } else {
        log(`  ↳ url download failed: ${dlData.error} — skip`)
        return null
      }
    } catch (err: any) {
      log(`  ↳ url download exception: ${err?.message || err} — skip`)
      return null
    }
  } else {
    log('  ↳ no attachment and no documentUrl — skip')
    return null
  }

  if (!pdfBase64) {
    log('  ↳ no PDF bytes obtained — skip')
    return null
  }

  // Re-verify on the actual document and upload to Drive.
  try {
    const dlData = { base64: pdfBase64, contentType: pdfContentType, fileName: pdfFileName }

    const pdfExtractRes = await fetch('/api/match-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'extract-pdf',
        pdfBase64: dlData.base64,
        transaction: { date: tx.date, description: desc, amount: tx.amount },
        claudeApiKey,
      }),
    })
    const pdfExtracted = await pdfExtractRes.json()
    log('  ↳ pdf extract →', { vendor: pdfExtracted.vendor, matchesTransaction: pdfExtracted.matchesTransaction, matchReason: pdfExtracted.matchReason })

    if (pdfExtracted.error) {
      log(`  ↳ pdf extract error: ${pdfExtracted.error} — skip`)
      return null
    }
    if (pdfExtracted.matchesTransaction === false) {
      log(`  ↳ claude rejected on PDF: ${pdfExtracted.matchReason} — skip`)
      return null
    }
    const finalExtracted = { ...extracted, ...pdfExtracted, documentUrl: extracted.documentUrl }

    // Upload PDF to Drive — independent copy.
    const binary = atob(dlData.base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: dlData.contentType || 'application/pdf' })
    const fileName = dlData.fileName || `receipt-${finalExtracted.vendor || 'unknown'}.pdf`
    const file = new File([blob], fileName, { type: blob.type })
    const uploaded = await uploadExpenseDocument(file, parseDateFolder(tx.date))
    log('  ↳ drive upload →', { driveFileId: uploaded.fileId, driveWebViewLink: uploaded.webViewLink })

    if (!uploaded.webViewLink) {
      log('  ↳ drive upload did not produce a link — skip')
      return null
    }

    return {
      transactionId: tx.id,
      fileName: 'drive-upload',
      vendor: finalExtracted.vendor,
      amount: finalExtracted.amount,
      vatAmount: finalExtracted.vatAmount,
      date: finalExtracted.date,
      description: finalExtracted.documentTitle || finalExtracted.description,
      driveFileId: uploaded.fileId,
      driveWebViewLink: uploaded.webViewLink,
      extractedData: finalExtracted,
      sourceType: 'gmail',
      gmailMessageId: msgId,
      uploadedAt: new Date().toISOString(),
    }
  } catch (err: any) {
    log(`  ↳ pdf flow exception: ${err?.message || err} — skip`)
    return null
  }
}

export { parseDateFolder }
