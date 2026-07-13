/**
 * Receipt matching service — finds and extracts receipt data from Gmail emails.
 * Extracted from ExpenseTab to keep the component under the line limit.
 */
import { db, type ExpenseDocument } from '@/app/db/financeDB'
import { searchMessages, fetchMessagesMetadata, fetchMessageBody, fetchFirstPdfAttachment } from '@/app/services/gmailService'
import { uploadExpenseDocument } from '@/app/services/googleDriveService'
import { findSupplierByAlias, addEmailSenderToSupplier } from '@/app/services/supplierService'

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

function buildDateRange(dateStr: string, days: number = 3): string {
  const { year, month, day } = parseTxDate(dateStr)
  const txDate = new Date(year, month - 1, day)
  const after = new Date(txDate)
  after.setDate(after.getDate() - days)
  const before = new Date(txDate)
  before.setDate(before.getDate() + days)
  const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return `after:${fmt(after)} before:${fmt(before)}`
}

// Most receipts land within a few days of the transaction, but some vendors
// (e.g. municipal bills) email weeks ahead of the actual charge date
// (confirmed live: a Kfar Yona municipality bill was emailed 20 days before
// the bank charge — outside a fixed ±3 day window). Start narrow (fast,
// precise) and only widen if nothing turns up.
const SEARCH_WINDOWS_DAYS = [3, 14, 45]

/** One Gmail message the matcher actually looked at, and what happened to it. */
export type CheckedCandidate = {
  messageId: string
  date: string
  subject: string
  from: string
  outcome: 'matched' | 'rejected'
  reason: string
}

/** What the matcher actually searched — surfaced in the UI so "no-match" is never opaque. */
export type SearchInfo = { senders: string[]; dateRange: string }

export type MatchResult =
  | { status: 'matched'; doc: ExpenseDocument; checkedCandidates: CheckedCandidate[]; searchInfo: SearchInfo }
  | { status: 'no-match'; checkedCandidates: CheckedCandidate[]; searchInfo: SearchInfo }
  | { status: 'error'; checkedCandidates: CheckedCandidate[]; searchInfo: SearchInfo }

/**
 * Search Gmail for a receipt matching the transaction, extract data, upload to Drive.
 */
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
function normalizeExpenseDocFields(extracted: any): Pick<ExpenseDocument, 'externalTxRef' | 'referenceNumber' | 'docType'> {
  return {
    externalTxRef: typeof extracted.externalTxRef === 'string' ? extracted.externalTxRef : undefined,
    referenceNumber: typeof extracted.referenceNumber === 'string' ? extracted.referenceNumber : undefined,
    docType:
      extracted.docType === 'invoice' ||
      extracted.docType === 'receipt' ||
      extracted.docType === 'receipt-invoice' ||
      extracted.docType === 'unknown'
        ? extracted.docType
        : undefined,
  }
}

export async function matchReceiptForTransaction(
  tx: { id: number; date: string; description: string; merchant?: string; amount: number },
  claudeApiKey: string,
): Promise<MatchResult> {
  const desc = (tx.merchant || tx.description || '').trim()
  const log = (...args: unknown[]) => console.log('[match]', `tx#${tx.id}`, desc, '·', ...args)

  log('start', { date: tx.date, amount: tx.amount })

  // Known-supplier sender search. If a prior match already taught us this
  // vendor's real invoice sender address(es), search those directly —
  // deterministic and far more precise than the broad subject search below.
  // Tried first; when it finds candidates, the broad search is skipped.
  // Widens the date window progressively (see SEARCH_WINDOWS_DAYS) instead of
  // giving up after one fixed window.
  let knownSenderMessageIds: string[] = []
  let dateRange = buildDateRange(tx.date, SEARCH_WINDOWS_DAYS[0])
  const knownSupplier = await findSupplierByAlias(desc)
  if (knownSupplier && knownSupplier.emailSenders.length > 0) {
    log('known supplier match:', knownSupplier.name, '· trying known senders first:', knownSupplier.emailSenders)
    for (const days of SEARCH_WINDOWS_DAYS) {
      dateRange = buildDateRange(tx.date, days)
      for (const sender of knownSupplier.emailSenders) {
        const senderQuery = `from:${sender} ${dateRange}`
        const senderResult = await searchMessages(senderQuery, { searchAllMail: true, maxResults: 5 })
        log(`known-sender search →`, sender, `±${days}d`, { count: senderResult.messageIds.length, error: senderResult.error })
        knownSenderMessageIds.push(...senderResult.messageIds)
      }
      if (knownSenderMessageIds.length > 0) break
      log(`no candidates within ±${days} days for any known sender`)
    }
  }
  const searchInfo: SearchInfo = { senders: knownSupplier?.emailSenders || [], dateRange }

  // No known sender → no search. Guessing by subject/keyword or asking an
  // LLM to pick a sender out of a date-window dump is exactly the fragility
  // this replaced (confirmed live: Gmail's AND-of-terms search missed a real
  // receipt, and LLM guessing added latency without reliability). The fix is
  // to set the supplier's email once (SupplierCardModal) — after that this
  // vendor always hits the deterministic path above.
  if (knownSenderMessageIds.length === 0) {
    log('no known supplier sender — set the supplier email to enable search')
    return { status: 'no-match', checkedCandidates: [], searchInfo }
  }
  const candidateMessageIds = Array.from(new Set(knownSenderMessageIds))

  // From here on we REQUIRE Claude: verification + extraction + storage.
  if (!claudeApiKey) {
    log('missing Claude API key — required for verification + extraction')
    return { status: 'error', checkedCandidates: [], searchInfo }
  }

  // Fetch date/subject/from for every candidate up front — some paths
  // (known-sender, vendor-token) only have bare message ids at this point.
  // This is what lets the UI show a real "here's what we checked" list
  // instead of an opaque no-match.
  const candidateMeta = await fetchMessagesMetadata(candidateMessageIds)
  const metaByMsgId = new Map(candidateMeta.messages.map((m) => [m.id, m]))

  // Cheap subject-only Gemini pre-filter before any expensive Claude
  // extraction. The known-sender search can return unrelated mail from the
  // same address (confirmed live: YPAY's from:no-reply@ypay.co.il matched
  // both a real "חשבונית מס קבלה" AND an unrelated login-verification-code
  // email) — sending every candidate's full body through Claude to find out
  // is slow (7-12s each) and expensive. Gemini looks at subjects only and
  // picks the single best candidate (or none); only that one goes on to the
  // real extraction below.
  const pickList = candidateMessageIds.map((id, i) => ({ index: i, id, meta: metaByMsgId.get(id) }))
  const pickRes = await fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'pick-candidate',
      transaction: { date: tx.date, description: desc, amount: tx.amount, merchant: tx.merchant },
      candidates: pickList.map((p) => ({
        index: p.index, subject: p.meta?.subject || '', from: p.meta?.from || '',
        date: p.meta?.date || '', snippet: p.meta?.snippet || '',
      })),
    }),
  })
  const pickData = await pickRes.json()
  log('gemini subject pick →', JSON.stringify(pickData))

  if (pickData.candidateIndex == null) {
    log('no candidate looked like an invoice by subject — returning no-match without extraction')
    const checkedCandidates: CheckedCandidate[] = pickList.map((p) => ({
      messageId: p.id,
      date: p.meta?.date || '',
      subject: p.meta?.subject || '',
      from: p.meta?.from || '',
      outcome: 'rejected',
      reason: pickData.reason || 'לא זוהה כחשבונית/קבלה לפי הנושא',
    }))
    return { status: 'no-match', checkedCandidates, searchInfo }
  }

  // Try Gemini's pick first, then fall back to the rest if it's rejected —
  // subject-only filtering can't always disambiguate (confirmed live: two
  // YPAY "חשבונית מס קבלה" emails, same sender, 34 seconds apart, identical
  // subject — Gemini picked one arbitrarily, it turned out to be the wrong
  // amount, and the real receipt was the other one). A single shot with no
  // fallback silently drops genuine matches in exactly this case. Cost stays
  // bounded — this is at most the handful of candidates the known-sender
  // search itself found, not a broad re-search.
  const order = [pickData.candidateIndex, ...pickList.map((p) => p.index).filter((i) => i !== pickData.candidateIndex)]
  const checkedCandidates: CheckedCandidate[] = []
  for (const idx of order) {
    const msgId = candidateMessageIds[idx]
    const meta = metaByMsgId.get(msgId)
    log('verifying candidate:', meta?.subject || msgId, idx === pickData.candidateIndex ? '(gemini pick)' : '(fallback)')
    let lastReason = ''
    const candidateLog = (...args: unknown[]) => {
      const text = args.filter((a) => typeof a === 'string').join(' ')
      if (text.includes('  ↳')) lastReason = text.replace('  ↳', '').trim()
      log(...args)
    }
    const doc = await tryCandidate(msgId, tx, desc, claudeApiKey, candidateLog, {
      subject: meta?.subject || '',
      from: meta?.from || '',
      candidateIndex: order.indexOf(idx) + 1,
      totalCandidates: order.length,
    })
    checkedCandidates.push({
      messageId: msgId,
      date: meta?.date || '',
      subject: meta?.subject || '',
      from: meta?.from || '',
      outcome: doc ? 'matched' : 'rejected',
      reason: doc ? '' : lastReason,
    })
    if (doc) return { status: 'matched', doc, checkedCandidates, searchInfo }
  }
  log('all candidates exhausted — returning no-match')
  return { status: 'no-match', checkedCandidates, searchInfo }
}

/**
 * Try a single Gmail message as a receipt for the transaction. Returns the
 * stored ExpenseDocument on success, null on any skip-this-candidate reason.
 * Errors during PDF download / Drive upload count as skip — the caller may
 * still have other candidates to try.
 */
/** POST download-pdf and return the raw bytes, or the server's error string. */
async function downloadPdfFromUrl(url: string): Promise<{ base64: string; contentType: string; fileName?: string } | { error: string }> {
  const dlRes = await fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'download-pdf', url }),
  })
  const dlData = await dlRes.json()
  if (dlData.base64) {
    return { base64: dlData.base64, contentType: dlData.contentType || 'application/pdf', fileName: dlData.fileName }
  }
  return { error: dlData.error || 'download failed' }
}

/** POST extract-pdf and return Claude's parsed extraction (or an {error} shape). */
async function extractFromPdfBase64(
  base64: string,
  tx: { date: string; amount: number },
  desc: string,
  claudeApiKey: string,
): Promise<any> {
  const res = await fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'extract-pdf',
      pdfBase64: base64,
      transaction: { date: tx.date, description: desc, amount: tx.amount },
      claudeApiKey,
    }),
  })
  return res.json()
}

async function tryCandidate(
  msgId: string,
  tx: { id: number; date: string; description: string; merchant?: string; amount: number },
  desc: string,
  claudeApiKey: string,
  log: (...args: unknown[]) => void,
  candidateInfo: { subject: string; from: string; candidateIndex: number; totalCandidates: number },
): Promise<ExpenseDocument | null> {
  log(`trying candidate ${candidateInfo.candidateIndex}/${candidateInfo.totalCandidates} ${msgId} · "${candidateInfo.subject}" from ${candidateInfo.from}`)

  // Fetch email body (also returns From header so we can apply sender-based routing)
  const bodyResult = await fetchMessageBody(msgId)
  if (bodyResult.error || !bodyResult.body) {
    log(`  ↳ body fetch failed: ${bodyResult.error || 'empty body'} — skip`)
    return null
  }

  // Claude verifies + extracts from the email body. subject/from/candidateIndex
  // are echoed back so the SERVER log (not just the browser console) shows
  // which candidate is being sent to Claude — every Gmail-search candidate
  // goes through this call, so this is the trail that answers "how many
  // extraction calls did this search actually cost."
  const extractRes = await fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'extract',
      emailBody: bodyResult.body,
      candidateSubject: candidateInfo.subject,
      candidateFrom: candidateInfo.from,
      candidateIndex: candidateInfo.candidateIndex,
      totalCandidates: candidateInfo.totalCandidates,
      transaction: { date: tx.date, description: desc, amount: tx.amount },
      claudeApiKey,
    }),
  })
  const extracted = await extractRes.json()
  log('  ↳ email extract →', { vendor: extracted.vendor, matchesTransaction: extracted.matchesTransaction, matchReason: extracted.matchReason, documentUrl: !!extracted.documentUrl })

  if (extracted.error) {
    // A provider-level failure (e.g. depleted Anthropic credits, bad key,
    // rate limit) affects EVERY candidate — don't silently skip it as if this
    // one email just didn't match. Throw so matchReceiptForTransaction aborts
    // and the real message reaches the user instead of a misleading "no match".
    if (extracted.providerError) {
      throw new Error(extracted.error)
    }
    log(`  ↳ extract error: ${extracted.error} — skip`)
    return null
  }
  // URL-only invoice senders (e.g. YPAY): the email body is a generic "view
  // document" template with a CTA button — no date/amount/vendor text at all,
  // just the button. Claude's matchesTransaction check on the body is
  // therefore meaningless for these senders (confirmed live: a genuine YPAY
  // receipt got rejected as "no matching date/amount/vendor" because the body
  // really has none — the real numbers only exist behind the CTA link). Skip
  // the matchesTransaction gate entirely for these senders and follow the CTA
  // straight away; persist the URL and skip the PDF/Drive flow — UI renders
  // an "open invoice" link.
  if (isUrlOnlyInvoiceSender(bodyResult.from)) {
    const ctaUrl = extracted.documentUrl || (bodyResult.contentType === 'html' ? extractCtaUrlFromHtml(bodyResult.body) : null)
    if (!ctaUrl) {
      log('  ↳ url-only sender but no CTA url found — skip')
      return null
    }
    log('  ↳ url-only invoice sender — downloading real document from:', ctaUrl)

    // The email body has no amount/VAT — those only exist on the document
    // behind the CTA link. A raw HTML text-scrape of that page came back
    // empty (confirmed live: the page renders its content client-side via
    // JS, so a plain server fetch only sees an empty shell). Download the
    // actual file instead and run it through the same vision-extraction
    // pipeline normal PDF attachments use — reusing download-pdf/extract-pdf,
    // which already knows how to follow redirects and reject HTML-viewer
    // wrapper pages in favor of the real binary.
    let pageExtracted = extracted
    try {
      const downloaded = await downloadPdfFromUrl(ctaUrl)
      if ('base64' in downloaded) {
        log('  ↳ document download →', { contentType: downloaded.contentType })
        const pageExtractedRes = await extractFromPdfBase64(downloaded.base64, tx, desc, claudeApiKey)
        log('  ↳ document extract →', { vendor: pageExtractedRes.vendor, amount: pageExtractedRes.amount, vatAmount: pageExtractedRes.vatAmount, error: pageExtractedRes.error })
        if (!pageExtractedRes.error) {
          // The sender-level from:/date search can return several genuinely
          // different YPAY invoices in the same window (confirmed live: a
          // ₪59 "ממשק API" invoice got linked to BOTH a ₪23 and a ₪59
          // transaction). YPAY is ILS-only — no foreign-currency excuse for a
          // mismatch — so once we have the real amount, it must match.
          const amountKnown = typeof pageExtractedRes.amount === 'number'
          const amountMismatch = amountKnown && Math.abs(Math.abs(pageExtractedRes.amount) - Math.abs(tx.amount)) > 1
          if (amountMismatch) {
            log(`  ↳ document amount ₪${pageExtractedRes.amount} doesn't match transaction ₪${tx.amount} — rejecting`)
            return null
          }
          pageExtracted = pageExtractedRes
        }
      } else {
        log('  ↳ could not download the document (HTML-viewer only, no binary reachable) — amount/VAT will be unknown:', downloaded.error)
      }
    } catch (err: any) {
      log('  ↳ document download/extract threw — amount/VAT will be unknown:', err?.message || String(err))
    }

    const urlMatchSupplier = await findSupplierByAlias(desc)
    if (urlMatchSupplier && bodyResult.from) {
      await addEmailSenderToSupplier(urlMatchSupplier.id!, bodyResult.from)
    }
    return {
      transactionId: tx.id,
      fileName: pageExtracted.documentTitle || pageExtracted.vendor || extracted.vendor || 'invoice',
      vendor: pageExtracted.vendor || extracted.vendor,
      amount: pageExtracted.amount,
      vatAmount: pageExtracted.vatAmount,
      date: pageExtracted.date || extracted.date,
      description: pageExtracted.documentTitle || pageExtracted.description || extracted.description,
      externalUrl: ctaUrl,
      ...normalizeExpenseDocFields(pageExtracted),
      extractedData: pageExtracted,
      sourceType: 'gmail',
      gmailMessageId: msgId,
      uploadedAt: new Date().toISOString(),
    }
  }
  // Deliberately NOT gating on extracted.matchesTransaction here. Many
  // receipt emails carry zero amount/date in the body itself — just "your
  // invoice is attached" (confirmed live: a 019 mobile invoice body said only
  // "see the attached PDF, install Adobe Acrobat if it won't open"). Claude
  // correctly can't verify a match from a body with no data, and that
  // uncertainty isn't the same thing as a genuine mismatch — but gating here
  // rejected the candidate before ever looking at its real attachment. The
  // PDF-based matchesTransaction check below (once we actually have content
  // to judge from) is the one that should decide.

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
      const downloaded = await downloadPdfFromUrl(extracted.documentUrl)
      if ('base64' in downloaded) {
        pdfBase64 = downloaded.base64
        pdfContentType = downloaded.contentType
        pdfFileName = downloaded.fileName
      } else {
        log(`  ↳ url download failed: ${downloaded.error} — skip`)
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

    const pdfExtracted = await extractFromPdfBase64(dlData.base64, tx, desc, claudeApiKey)
    log('  ↳ pdf extract →', { vendor: pdfExtracted.vendor, matchesTransaction: pdfExtracted.matchesTransaction, matchReason: pdfExtracted.matchReason })

    if (pdfExtracted.error) {
      // Same provider-vs-per-candidate distinction as the email-body extract
      // above: a systemic Claude failure (bad model id, depleted credits,
      // rate limit) will 404/fail identically for every remaining candidate,
      // so silently skipping it here just relabels the real error as a
      // misleading "no match". Abort and let the real message reach the user.
      if (pdfExtracted.providerError) {
        throw new Error(pdfExtracted.error)
      }
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

    const driveMatchSupplier = await findSupplierByAlias(desc)
    if (driveMatchSupplier && bodyResult.from) {
      await addEmailSenderToSupplier(driveMatchSupplier.id!, bodyResult.from)
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
      ...normalizeExpenseDocFields(finalExtracted),
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
