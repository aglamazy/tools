/**
 * Receipt matching service — finds and extracts receipt data from Gmail emails.
 * Extracted from ExpenseTab to keep the component under the line limit.
 */
import { db, type ExpenseDocument } from '@/app/db/financeDB'
import { searchMessages, fetchMessagesMetadata, fetchMessageBody, fetchFirstPdfAttachment } from '@/app/services/gmailService'
import { uploadExpenseDocument } from '@/app/services/googleDriveService'
import { findSupplierByAlias, addEmailSenderToSupplier } from '@/app/services/supplierService'

// Agla, 2026-09-15: "I want tail -f command to see the dev server log." The
// matching steps below run client-side (browser console only) — this mirrors
// each log line to the server so it also lands in the terminal/run.log via
// the API route's own console.log. Fire-and-forget: never blocks or fails
// the actual matching flow if the request itself errors.
function formatLogArg(a: unknown): string {
  if (typeof a === 'string') return a
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function logToServer(prefix: string, args: unknown[]) {
  const line = [prefix, ...args.map(formatLogArg)].join(' ')
  fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'log', message: line }),
  }).catch(() => {})
}

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
  // Confirmed live 2026-09-14: a real מעיינות השרון water-utility bill
  // (sent via the shared "Mast" billing platform) hit the exact same shape
  // as YPAY — downloadPdfFromUrl correctly detected and rejected the
  // bill-viewer URL as an HTML wrapper, not a binary PDF, and the candidate
  // was skipped even though it plausibly WAS the real bill.
  'mast@outbox.co.il',
]

function isUrlOnlyInvoiceSender(fromHeader: string | undefined): boolean {
  if (!fromHeader) return false
  const lower = fromHeader.toLowerCase()
  return URL_ONLY_INVOICE_SENDERS.some(addr => lower.includes(addr))
}

// A generic OR-of-terms query, deliberately NOT ANDed with the vendor name —
// an earlier attempt at a broad search ANDed subject terms with the vendor
// name and missed a real receipt because the wording didn't match exactly.
// The vendor/amount are hints handed to the LLM pick-candidate step below,
// never a hard Gmail query filter (Agla, 2026-09-14: "Agent should look by
// content. Vendor supplier is hint, not limitation. I don't want to overhead
// the user to find vendor email.") — precision comes from that step plus the
// extraction-verification step's matchesTransaction check, both of which
// already protect the known-sender path, not from narrowing the query.
const RECEIPT_KEYWORD_QUERY = '(חשבונית OR קבלה OR invoice OR receipt OR "tax invoice")'
// Confirmed live 2026-09-14 (Agla: a real Cellcom invoice "in the inbox, but
// not found"): Gmail's own relevance ranking for this OR-of-generic-terms
// query is NOT date order — the real invoice sat at position 49 of 100 hits
// in a 201-email window, and an earlier one at position 95. 25 (or even 45)
// wasn't remotely enough; only fetching Gmail's full one-page max (100)
// actually reached it. The cheap pick-candidate triage step below is a
// single batched LLM call over all subjects (not per-candidate), so scaling
// to 100 is cheap — the expensive per-candidate real extraction only ever
// runs on the ones that step flags as document-shaped.
const CONTENT_SEARCH_MAX_RESULTS = 100

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
  tx: { id: number; syncId?: string; date: string; description: string; merchant?: string; amount: number },
  claudeApiKey: string,
): Promise<MatchResult> {
  const desc = (tx.merchant || tx.description || '').trim()
  const log = (...args: unknown[]) => {
    console.log('[match]', `tx#${tx.id}`, desc, '·', ...args)
    logToServer(`[match] tx#${tx.id} ${desc} ·`, args)
  }

  log('start', { date: tx.date, amount: tx.amount })

  // Known-supplier sender search. If a prior match already taught us this
  // vendor's real invoice sender address(es), search those directly first —
  // deterministic and far cheaper than the content search below. Widens the
  // date window progressively (see SEARCH_WINDOWS_DAYS) instead of giving up
  // after one fixed window.
  let candidateMessageIds: string[] = []
  let dateRange = buildDateRange(tx.date, SEARCH_WINDOWS_DAYS[0])
  const knownSupplier = await findSupplierByAlias(desc)
  const knownSenders = knownSupplier?.emailSenders || []
  if (knownSenders.length > 0) {
    log('known supplier match:', knownSupplier!.name, '· trying known senders first:', knownSenders)
    for (const days of SEARCH_WINDOWS_DAYS) {
      dateRange = buildDateRange(tx.date, days)
      for (const sender of knownSenders) {
        const senderQuery = `from:${sender} ${dateRange}`
        const senderResult = await searchMessages(senderQuery, { searchAllMail: true, maxResults: 5 })
        log(`known-sender search →`, sender, `±${days}d`, { count: senderResult.messageIds.length, error: senderResult.error })
        candidateMessageIds.push(...senderResult.messageIds)
      }
      if (candidateMessageIds.length > 0) break
      log(`no candidates within ±${days} days for any known sender`)
    }
  }

  // The known sender is a HINT, never a hard requirement (Agla, 2026-09-14:
  // "Agent should look by content. Vendor supplier is hint, not limitation. I
  // don't want to overhead the user to find vendor email.") — no configured
  // supplier, no sender at all, or a configured sender that's simply wrong
  // must never dead-end the user. Fall back to a broad content search across
  // ALL mail in the date window; the same pick-candidate subject-filter and
  // extraction-verification steps that already guard the known-sender path
  // protect this wider candidate pool too, so precision comes from THEM, not
  // from a narrow query (an earlier ANDed-with-vendor-name query missed a
  // real receipt over wording differences — this is deliberately an
  // OR-of-generic-terms query instead).
  if (candidateMessageIds.length === 0) {
    // Search the WIDEST window in one shot, not incrementally like the
    // known-sender loop above. Reproduced live 2026-09-14 (Agla: a real
    // Celcom invoice sitting in the inbox, ~40 days before the bank charge,
    // reported "not found"): the incremental version searched ±3d, got 3
    // unrelated candidates, and stopped widening right there because
    // "candidates found" was mistaken for "the right candidate found" — the
    // real invoice 40 days out was never reached. Content search is a single
    // query per window (not per-sender like the known-sender loop), so
    // there's no cost reason to start narrow; a wide query still returns
    // narrower/closer-dated matches too.
    log('no known-sender candidates — falling back to content search')
    dateRange = buildDateRange(tx.date, SEARCH_WINDOWS_DAYS[SEARCH_WINDOWS_DAYS.length - 1])
    const contentResult = await searchMessages(`${RECEIPT_KEYWORD_QUERY} ${dateRange}`, { searchAllMail: true, maxResults: CONTENT_SEARCH_MAX_RESULTS })
    log('content search →', dateRange, { count: contentResult.messageIds.length, error: contentResult.error })
    candidateMessageIds.push(...contentResult.messageIds)
  }

  const searchInfo: SearchInfo = { senders: knownSenders, dateRange }

  if (candidateMessageIds.length === 0) {
    log('no candidates found — neither known sender nor content search')
    return { status: 'no-match', checkedCandidates: [], searchInfo }
  }
  candidateMessageIds = Array.from(new Set(candidateMessageIds))

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
  // email), and the broad content search (aglamazo#397) can return real
  // financial documents for OTHER vendors — sending every candidate's full
  // body through Claude to find out is slow (7-12s each) and expensive, so
  // this only triages "not a document at all" (login codes, newsletters) out
  // — every candidate that DOES look like some kind of document goes on to
  // real extraction below, regardless of whether it looks like THIS vendor
  // (vendor relevance is decided by real content, not a subject-only guess).
  const pickList = candidateMessageIds.map((id, i) => ({ index: i, id, meta: metaByMsgId.get(id) }))
  const pickRes = await fetch('/api/match-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'pick-candidate',
      claudeApiKey,
      transaction: { date: tx.date, description: desc, amount: tx.amount, merchant: tx.merchant },
      candidates: pickList.map((p) => ({
        index: p.index, subject: p.meta?.subject || '', from: p.meta?.from || '',
        date: p.meta?.date || '', snippet: p.meta?.snippet || '',
      })),
    }),
  })
  const pickData = await pickRes.json()
  log('gemini subject pick →', JSON.stringify(pickData))

  // Reproduced live, 2026-09-14 (Agla): a real "חשבונית מס קבלה" email was
  // rejected as "not identified by subject" — the actual cause was Gemini
  // getting cut off mid-response (finishReason=MAX_TOKENS) and the route
  // returning an error shape with no candidateIndex key at all. Since
  // undefined == null, that failure was silently falling into the genuine
  // "nothing looks like an invoice" branch below and reporting a false,
  // confident-sounding reason. A real call failure must surface as 'error',
  // never masquerade as a considered rejection.
  if (!pickRes.ok || pickData.error) {
    log('pick-candidate call failed — not a real no-match:', pickData.error || pickRes.status)
    const checkedCandidates: CheckedCandidate[] = pickList.map((p) => ({
      messageId: p.id,
      date: p.meta?.date || '',
      subject: p.meta?.subject || '',
      from: p.meta?.from || '',
      outcome: 'rejected',
      reason: `בדיקת הנושא נכשלה: ${pickData.error || `שגיאת שרת (${pickRes.status})`}`,
    }))
    return { status: 'error', checkedCandidates, searchInfo }
  }

  // Candidates the cheap filter is confident aren't a financial document at
  // all (login codes, newsletters, marketing) skip the expensive real check
  // — the only thing this step decides. Everything that looks like SOME kind
  // of document goes on to real extraction below, in the order the filter
  // judged most likely (see route.ts prompt), stopping at the first real
  // match but trying the rest if it turns out wrong (confirmed live: two
  // same-sender "חשבונית מס קבלה" emails 34 seconds apart, only one had the
  // right amount).
  const documentIndices: number[] = Array.isArray(pickData.documentIndices) ? pickData.documentIndices : []
  const documentIndexSet = new Set(documentIndices)
  const notDocumentCandidates: CheckedCandidate[] = pickList
    .filter((p) => !documentIndexSet.has(p.index))
    .map((p) => ({
      messageId: p.id,
      date: p.meta?.date || '',
      subject: p.meta?.subject || '',
      from: p.meta?.from || '',
      outcome: 'rejected',
      reason: pickData.reason || 'לא זוהה כמסמך חשבונאי לפי הנושא',
    }))

  if (documentIndices.length === 0) {
    log('no candidate looked like any kind of financial document by subject — returning no-match without extraction')
    return { status: 'no-match', checkedCandidates: notDocumentCandidates, searchInfo }
  }

  // Agla, live, watching many rows sit in "מחפש…": "It doesn't make sense it
  // takes so long." Real cause — the content-search widening fix (aglamazo,
  // 2026-09-15, checking up to 100 candidates) can hand this step 40+
  // document-shaped candidates for a vendor that genuinely has no matching
  // email at all (every one of them a real, non-trivial extraction call:
  // fetch body, sometimes download+vision-extract a PDF). Running them one
  // at a time made the worst case (e.g. 43 candidates, none of them right)
  // take minutes for nothing. Verify a bounded number at once instead —
  // same coverage, no candidate skipped, just not serialized.
  const CANDIDATE_VERIFY_CONCURRENCY = 4
  const checkedCandidates: CheckedCandidate[] = [...notDocumentCandidates]
  let matchedDoc: ExpenseDocument | null = null
  let stop = false
  let nextPos = 0

  const verifyWorker = async () => {
    while (!stop) {
      const pos = nextPos++
      if (pos >= documentIndices.length) return
      const idx = documentIndices[pos]
      const msgId = candidateMessageIds[idx]
      const meta = metaByMsgId.get(msgId)
      log('verifying candidate:', meta?.subject || msgId)
      let lastReason = ''
      const candidateLog = (...args: unknown[]) => {
        const text = args.filter((a) => typeof a === 'string').join(' ')
        if (text.includes('  ↳')) lastReason = text.replace('  ↳', '').trim()
        log(...args)
      }
      const doc = await tryCandidate(msgId, tx, desc, claudeApiKey, candidateLog, {
        subject: meta?.subject || '',
        from: meta?.from || '',
        candidateIndex: pos + 1,
        totalCandidates: documentIndices.length,
      })
      checkedCandidates.push({
        messageId: msgId,
        date: meta?.date || '',
        subject: meta?.subject || '',
        from: meta?.from || '',
        outcome: doc ? 'matched' : 'rejected',
        reason: doc ? '' : lastReason,
      })
      if (doc && !matchedDoc) {
        matchedDoc = doc
        stop = true
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CANDIDATE_VERIFY_CONCURRENCY, documentIndices.length) }, () => verifyWorker())
  )

  if (matchedDoc) return { status: 'matched', doc: matchedDoc, checkedCandidates, searchInfo }
  log('all document candidates exhausted — returning no-match')
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
  tx: { id: number; syncId?: string; date: string; description: string; merchant?: string; amount: number },
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

    // aglamazo#403 (Sheli): when the real document behind the CTA can't be
    // downloaded, pageExtracted falls back to the body-level `extracted` —
    // and unlike the "no data to judge from" case the comment above is
    // about, Claude sometimes DOES have enough in the body (a document
    // title, a vendor name) to make a real, informed rejection. Live
    // incident: a water bill's matchesTransaction:false + a real matchReason
    // was discarded and the doc attached anyway to an unrelated Arnona
    // transaction. An explicit false is a decision already made — honor it,
    // same as the PDF path below already does.
    if (pageExtracted.matchesTransaction === false) {
      log(`  ↳ claude rejected: ${pageExtracted.matchReason} — skip`)
      return null
    }

    const urlMatchSupplier = await findSupplierByAlias(desc)
    if (urlMatchSupplier && bodyResult.from) {
      await addEmailSenderToSupplier(urlMatchSupplier.id!, bodyResult.from)
    }
    return {
      transactionId: tx.syncId!,
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
      transactionId: tx.syncId!,
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

/**
 * Agla, live, on the read-only "מיילים שנבדקו" list showing a candidate his
 * own eyes could tell was the right receipt: "what is [this] good for? What
 * can I do with it?" — the subject pre-filter is a single non-deterministic
 * LLM call over the whole batch (see matchReceiptForTransaction above) and
 * can legitimately reject the right email in a tie (documented: three
 * identical "חשבונית מס קבלה" YPAY subjects in one window). This lets the
 * user pick ONE checked candidate directly and run the real
 * verification+extraction on it, skipping the subject guess entirely — the
 * PDF/body-level matchesTransaction and amount checks inside tryCandidate
 * still apply, so a genuinely wrong pick still gets rejected on its own
 * content, not rubber-stamped just because a human clicked it.
 */
export async function manualPickCandidate(
  messageId: string,
  candidateInfo: { subject: string; from: string },
  tx: { id: number; syncId?: string; date: string; description: string; merchant?: string; amount: number },
  desc: string,
  claudeApiKey: string,
): Promise<{ doc: ExpenseDocument } | { error: string }> {
  let lastReason = ''
  const log = (...args: unknown[]) => {
    const text = args.filter((a) => typeof a === 'string').join(' ')
    if (text.includes('  ↳')) lastReason = text.replace('  ↳', '').trim()
    console.log('[ReceiptMatch:manual]', ...args)
    logToServer('[ReceiptMatch:manual]', args)
  }
  try {
    const doc = await tryCandidate(messageId, tx, desc, claudeApiKey, log, {
      subject: candidateInfo.subject, from: candidateInfo.from, candidateIndex: 1, totalCandidates: 1,
    })
    if (doc) return { doc }
    return { error: lastReason || 'המסמך לא אומת מול העסקה — ייתכן שהסכום או הפרטים אינם תואמים' }
  } catch (err: any) {
    return { error: err?.message || String(err) }
  }
}

export { parseDateFolder }
