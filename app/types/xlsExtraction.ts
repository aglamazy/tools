/**
 * Shared types for the XLS LLM extraction pipeline.
 * Consumed by both the server-side API route (extract-xls-statement) and the
 * client-side reader utility (xlsLlmReader).
 */

export type XlsNormalizedTransaction = {
  date: string          // YYYY-MM-DD
  description: string   // bank: narration; credit: merchant name (normalized, collapsed whitespace)
  merchant?: string     // credit card: merchant name (may duplicate description)
  amount: number        // signed: negative = debit/charge, positive = credit/income
  balance?: number
  reference?: string
  currency?: string     // defaults ILS
  isCreditCardCharge?: boolean
  cardNumber?: string   // 4 digits, only if isCreditCardCharge
  currentStep?: number
  totalSteps?: number
  totalAmount?: number
}

export type XlsExtraction = {
  kind: 'bank' | 'credit'
  accountNumber?: string | null
  cardNumber?: string | null
  billingDate?: string | null    // YYYY-MM-DD
  processingMonth?: string | null // MM/YYYY
  issuer?: string | null
  transactions: XlsNormalizedTransaction[]
}
