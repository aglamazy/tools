import type { ExpenseDocument } from '@/app/db/financeDB'

/**
 * The ExpenseDocument a row's "העלה קובץ" control writes (ExpenseMatchCell).
 * aglamazo#489 clause 3: an upload links to THAT expense line only — its own
 * transaction syncId — never to another line found by the same search.
 */
export function buildUploadedExpenseDoc(params: {
  transactionSyncId: string | undefined
  fileName: string
  uploaded: { fileId?: string; webViewLink?: string }
  extracted: Record<string, any> | null | undefined
  now?: string
}): ExpenseDocument {
  const { transactionSyncId, fileName, uploaded, extracted } = params
  const x = extracted || {}
  return {
    transactionId: transactionSyncId,
    fileName,
    vendor: x.vendor,
    amount: x.amount,
    vatAmount: x.vatAmount,
    date: x.date,
    description: x.documentTitle || x.description,
    driveFileId: uploaded.fileId,
    driveWebViewLink: uploaded.webViewLink,
    extractedData: Object.keys(x).length > 0 ? x : undefined,
    sourceType: 'upload',
    uploadedAt: params.now ?? new Date().toISOString(),
    // A manual upload is often a deliberate override, so it is accepted, but
    // a mismatch is flagged visibly (2026-09-15, Agla: "It should be UI solvable").
    mismatch: x.matchesTransaction === false,
    mismatchDetails: x.matchReason,
  } as ExpenseDocument
}
