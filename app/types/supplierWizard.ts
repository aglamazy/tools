/**
 * Shared contracts for the Suppliers Wizard: sweeps Gmail for invoice-shaped
 * emails, fuzzy-matches each against known suppliers/bank-card aliases via
 * LLM, and lets the user review + approve before anything is written to
 * db.suppliers. Never auto-commits — a wrong merge would misattribute a
 * supplier's category/VAT status.
 */

/** One invoice-shaped email found by the Gmail sweep — raw, unmatched. */
export type GmailInvoiceCandidate = {
  messageId: string
  from: string // raw From header, e.g. "Vercel Inc." <invoice+statements@vercel.com>
  subject: string
  date: string // ISO
  snippet: string
}

/** One proposed action from the matcher, awaiting user approval. */
export type SupplierMatchProposal = {
  id: string // stable key for the review UI (use candidate.messageId)
  candidate: GmailInvoiceCandidate
  action: 'link-existing' | 'create-new' | 'no-match'
  matchedSupplierId?: number // set when action === 'link-existing'
  matchedSupplierName?: string // set when action === 'link-existing'
  proposedName?: string // set when action === 'create-new' (default: best vendor-name guess from the email)
  matchedBankAlias?: string // which existing bank/card alias string it matched against, for display
  confidence: 'high' | 'medium' | 'low'
  reasoning: string // short LLM explanation, shown in the review UI
}
