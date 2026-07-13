/**
 * Suppliers Wizard — step 1: sweep Gmail for invoice-shaped emails.
 * Pure Gmail-read function. No LLM calls, no matching logic, no Dexie writes —
 * the fuzzy-matching against known suppliers happens in a separate step.
 */
import { searchMessages, fetchMessagesMetadata } from '@/app/services/gmailService'
import type { GmailInvoiceCandidate } from '@/app/types/supplierWizard'

/**
 * Build a Gmail date-range query fragment covering the last `monthsBack`
 * months, in the same `after:YYYY/MM/DD before:YYYY/MM/DD` format used by
 * buildDateRange() in receiptMatchService.ts.
 */
function buildMonthsBackDateRange(monthsBack: number): string {
  const before = new Date()
  const after = new Date(before)
  after.setMonth(after.getMonth() - monthsBack)
  const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return `after:${fmt(after)} before:${fmt(before)}`
}

/**
 * Sweep Gmail for receipt/invoice-shaped emails over the last `monthsBack`
 * months and return them as raw, unmatched candidates for the suppliers
 * wizard's matching step.
 */
export async function sweepGmailForInvoices(
  monthsBack: number
): Promise<{ candidates: GmailInvoiceCandidate[]; error?: string }> {
  const dateRange = buildMonthsBackDateRange(monthsBack)
  const query = `(receipt OR invoice OR חשבונית OR קבלה) ${dateRange}`

  const searchResult = await searchMessages(query, { searchAllMail: true, maxResults: 100 })
  if (searchResult.error) {
    return { candidates: [], error: searchResult.error }
  }
  if (searchResult.messageIds.length === 0) {
    return { candidates: [] }
  }

  const metaResult = await fetchMessagesMetadata(searchResult.messageIds)
  if (metaResult.error) {
    return { candidates: [], error: metaResult.error }
  }

  // Individual metadata fetches can hit Gmail's rate limit (429) inside the
  // batched Promise.all — those come back as empty-field placeholders rather
  // than throwing. Drop them here instead of forwarding garbage candidates
  // (empty from/subject) into the matching step.
  const candidates: GmailInvoiceCandidate[] = metaResult.messages
    .filter((m) => m.from && m.from.length > 0)
    .map((m) => ({
      messageId: m.id,
      from: m.from,
      subject: m.subject,
      date: m.date,
      snippet: m.snippet,
    }))

  return { candidates }
}
