/**
 * Receipt matching service — finds and extracts receipt data from Gmail emails.
 * Extracted from ExpenseTab to keep the component under the line limit.
 */
import { db, type ExpenseDocument } from '@/app/db/financeDB'
import { searchMessages, fetchMessagesMetadata, fetchMessageBody } from '@/app/services/gmailService'
import { uploadExpenseDocument } from '@/app/services/googleDriveService'

function parseDateFolder(dateStr: string): { year: string; month: string } {
  const parts = dateStr.split(/[/.]/)
  const month = parts[1].padStart(2, '0')
  const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2]
  return { year, month }
}

function buildDateRange(dateStr: string): string {
  const parts = dateStr.split(/[/.]/)
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const year = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10)
  const txDate = new Date(year, month - 1, day)
  const after = new Date(txDate)
  after.setDate(after.getDate() - 3)
  const before = new Date(txDate)
  before.setDate(before.getDate() + 14)
  const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return `after:${fmt(after)} before:${fmt(before)}`
}

async function getMerchantCache(): Promise<Record<string, string>> {
  const setting = await db.appSettings.where('key').equals('merchantNameCache').first()
  return setting?.value ? JSON.parse(setting.value) : {}
}

async function saveMerchantCache(cache: Record<string, string>) {
  const existing = await db.appSettings.where('key').equals('merchantNameCache').first()
  if (existing) {
    await db.appSettings.update(existing.id!, { value: JSON.stringify(cache) })
  } else {
    await db.appSettings.add({ key: 'merchantNameCache', value: JSON.stringify(cache), updatedAt: new Date().toISOString() })
  }
}

export type MatchResult =
  | { status: 'matched'; doc: ExpenseDocument }
  | { status: 'no-match' }
  | { status: 'error' }

/**
 * Search Gmail for a receipt matching the transaction, extract data, upload to Drive.
 */
export async function matchReceiptForTransaction(
  tx: { id: number; date: string; description: string; merchant?: string; amount: number },
  claudeApiKey: string,
): Promise<MatchResult> {
  const desc = (tx.merchant || tx.description || '').trim()
  const dateRange = buildDateRange(tx.date)
  const cache = await getMerchantCache()

  let matchedMessageId: string | undefined

  // Check cache first
  const cachedName = cache[desc]
  if (cachedName) {
    const query = `from:${cachedName} (חשבונית OR קבלה OR receipt OR invoice)`
    const result = await searchMessages(query, { searchAllMail: true, maxResults: 5 })
    if (result.messageIds.length > 0) {
      matchedMessageId = result.messageIds[0]
    }
  }

  // No cache hit: broad date-range search → Gemini matches
  if (!matchedMessageId) {
    const searchResult = await searchMessages(dateRange, { searchAllMail: true, maxResults: 30 })
    if (searchResult.error) return { status: 'error' }
    if (searchResult.messageIds.length === 0) return { status: 'no-match' }

    const metaResult = await fetchMessagesMetadata(searchResult.messageIds.slice(0, 20))
    if (metaResult.error || metaResult.messages.length === 0) return { status: 'no-match' }

    // Gemini picks the best match
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

    if (!matchData.messageId && matchData.senderHint) {
      const narrowQuery = `from:${matchData.senderHint} (חשבונית OR קבלה OR receipt OR invoice) ${dateRange}`
      const narrowResult = await searchMessages(narrowQuery, { searchAllMail: true, maxResults: 5 })
      if (narrowResult.messageIds.length > 0) {
        matchedMessageId = narrowResult.messageIds[0]
        const senderDomain = matchData.senderHint.includes('@') ? matchData.senderHint.split('@')[1] : matchData.senderHint
        cache[desc] = senderDomain
        await saveMerchantCache(cache)
      }
    } else if (matchData.messageId) {
      matchedMessageId = matchData.messageId
    }

    if (!matchedMessageId) return { status: 'no-match' }

    // Cache the mapping
    if (!cache[desc]) {
      const matched = metaResult.messages.find(m => m.id === matchedMessageId)
      if (matched?.from) {
        const emailMatch = matched.from.match(/<([^>]+)>/)
        const senderDomain = emailMatch ? emailMatch[1].split('@')[1] : matched.from
        cache[desc] = senderDomain
        await saveMerchantCache(cache)
      }
    }
  }

  // Fetch email body
  const bodyResult = await fetchMessageBody(matchedMessageId!)
  if (bodyResult.error || !bodyResult.body) return { status: 'no-match' }

  // No Claude key — save basic match
  if (!claudeApiKey) {
    const doc: ExpenseDocument = {
      transactionId: tx.id,
      fileName: 'gmail-match',
      sourceType: 'gmail',
      gmailMessageId: matchedMessageId,
      uploadedAt: new Date().toISOString(),
    }
    return { status: 'matched', doc }
  }

  // Claude extracts receipt data
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

  // If there's a document URL, download PDF, re-extract, upload to Drive
  let driveFileId: string | undefined
  let driveWebViewLink: string | undefined
  let finalExtracted = extracted
  if (extracted.documentUrl) {
    try {
      const dlRes = await fetch('/api/match-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download-pdf', url: extracted.documentUrl }),
      })
      const dlData = await dlRes.json()
      if (dlData.base64) {
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
        if (!pdfExtracted.error) {
          finalExtracted = { ...extracted, ...pdfExtracted, documentUrl: extracted.documentUrl }
        }

        // Upload to Drive
        const binary = atob(dlData.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: dlData.contentType || 'application/pdf' })
        const fileName = dlData.fileName || `receipt-${finalExtracted.vendor || 'unknown'}.pdf`
        const file = new File([blob], fileName, { type: blob.type })
        const uploaded = await uploadExpenseDocument(file, parseDateFolder(tx.date))
        driveFileId = uploaded.fileId
        driveWebViewLink = uploaded.webViewLink
      }
    } catch {
      driveWebViewLink = extracted.documentUrl
    }
  }

  const doc: ExpenseDocument = {
    transactionId: tx.id,
    fileName: driveFileId ? 'drive-upload' : 'gmail-match',
    vendor: finalExtracted.vendor,
    amount: finalExtracted.amount,
    vatAmount: finalExtracted.vatAmount,
    date: finalExtracted.date,
    description: finalExtracted.documentTitle || finalExtracted.description,
    driveFileId,
    driveWebViewLink,
    extractedData: finalExtracted,
    sourceType: 'gmail',
    gmailMessageId: matchedMessageId,
    uploadedAt: new Date().toISOString(),
  }
  return { status: 'matched', doc }
}

export { parseDateFolder }
