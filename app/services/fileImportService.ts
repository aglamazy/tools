import { readFinancialFile } from '@/app/utils/financialFileReader'
import { readXlsWithLLM, isXlsFile } from '@/app/utils/xlsLlmReader'
import { parseCreditWithRegistry } from '@/app/utils/creditCardParser'
import { parseBankWithRegistry } from '@/app/utils/bankParser'
import { transactionStore } from '@/app/stores/transactionStore'
import { getCardTypeIndicators } from '@/app/services/appSettingsService'
import { normalizeDate } from '@/app/utils/parsers/shared'

export const fileImportService = {
  // Import credit card file
  importCreditCardFile: async (file: File, cardNumber: string, billingDate: Date | null, fileId?: string) => {
    // LLM path: for XLS/XLSX, extract structured transactions via Gemini instead of
    // running the hand-coded column parser. LLM normalizes merchant names so dedup
    // keys are stable across re-imports.
    if (isXlsFile(file)) {
      const llmResult = await readXlsWithLLM(file).catch((err: unknown) => {
        console.warn('[fileImportService] LLM XLS extraction failed, falling back to parser:', err)
        return null
      })

      if (llmResult && llmResult.kind === 'credit' && llmResult.transactions.length > 0) {
        const cardNum = llmResult.cardNumber || cardNumber
        if (!cardNum) throw new Error('Could not determine card number from file or input')

        // Billing date: prefer what the LLM found in the file; fall back to caller-supplied.
        const effectiveBillingDate: string = llmResult.billingDate ||
          (billingDate
            ? `${billingDate.getFullYear()}-${String(billingDate.getMonth() + 1).padStart(2, '0')}-${String(billingDate.getDate()).padStart(2, '0')}`
            : '')

        const processingMonth: string = llmResult.processingMonth ||
          (billingDate
            ? `${String(billingDate.getMonth() + 1).padStart(2, '0')}/${billingDate.getFullYear()}`
            : '')

        const effectiveFileId = fileId || `credit-${cardNum}-${processingMonth}`

        // Map LLM transactions → saveCreditCardData shape.
        // saveCreditCardData negates amount via -Math.abs(), so pass the raw LLM value.
        // normalizeDate defends against the LLM ever drifting off its prompted
        // YYYY-MM-DD format — every other producer (FIBI/credit parsers) already
        // canonicalizes through it, so this keeps the whole app on one format.
        const payments = llmResult.transactions.map((t) => ({
          transactionDate: normalizeDate(t.date) || t.date,
          merchant: t.merchant || t.description || '',
          amount: Math.abs(t.amount ?? 0),
          currentStep: t.currentStep ?? 1,
          totalSteps: t.totalSteps ?? 1,
          totalAmount: t.totalAmount != null ? Math.abs(t.totalAmount) : Math.abs(t.amount ?? 0),
        }))

        await transactionStore.saveCreditCardData(cardNum, payments, effectiveBillingDate, processingMonth, effectiveFileId)
        return payments.length
      }
    }

    // Fallback: deterministic column-mapping parsers (handles PDFs and XLS where LLM
    // returned no credit transactions, e.g. kind='bank' mismatch).
    const rows = await readFinancialFile(file)

    const parsed = parseCreditWithRegistry(rows)
    const statement = parsed.statement
    const cardNumberToUse = parsed.cardNumber || cardNumber

    if (!cardNumberToUse) {
      throw new Error('Could not determine card number for credit card file')
    }
    if (!rows.length) {
      throw new Error("Can't find transactions")
    }

    const effectiveBillingDate = statement.billingDate || billingDate

    const chargingDateStr = effectiveBillingDate
      ? normalizeDate(
          `${String(effectiveBillingDate.getDate()).padStart(2, '0')}/${String(effectiveBillingDate.getMonth() + 1).padStart(2, '0')}/${effectiveBillingDate.getFullYear()}`
        )
      : undefined

    const processingMonth =
      parsed.processingMonth ||
      (effectiveBillingDate
        ? `${String(effectiveBillingDate.getMonth() + 1).padStart(2, '0')}/${effectiveBillingDate.getFullYear()}`
        : '')

    const effectiveFileId = fileId || `credit-${cardNumberToUse}-${processingMonth}`

    await transactionStore.saveCreditCardData(cardNumberToUse, statement.payments, chargingDateStr || '', processingMonth, effectiveFileId)

    return statement.payments.length
  },

  // Import bank file
  importBankFile: async (file: File, processingMonth: string, fileId?: string) => {
    // LLM path: for XLS/XLSX, extract structured transactions via Gemini. This makes
    // bank import multi-bank (not FIBI-only) and normalizes descriptions so the dedup
    // key ${date}|${description}|${amount} is stable across re-imports (fixes #8).
    if (isXlsFile(file)) {
      const llmResult = await readXlsWithLLM(file).catch((err: unknown) => {
        console.warn('[fileImportService] LLM XLS extraction failed, falling back to parser:', err)
        return null
      })

      if (llmResult && llmResult.kind === 'bank' && llmResult.transactions.length > 0) {
        const accountNumber = llmResult.accountNumber
        if (!accountNumber) throw new Error('Could not extract account number from file')

        const effectiveProcessingMonth = processingMonth || llmResult.processingMonth || ''
        const effectiveFileId = fileId || `bank-${effectiveProcessingMonth}`

        // Transactions from LLM already have YYYY-MM-DD dates and normalized
        // descriptions — normalizeDate defends against the LLM drifting off
        // that format (see importCreditCardFile above for the same guard).
        const transactions = llmResult.transactions.map((t) => ({
          date: normalizeDate(t.date) || t.date,
          description: t.description,
          amount: t.amount,
          balance: t.balance,
          isCreditCardCharge: t.isCreditCardCharge || false,
          cardNumber: t.cardNumber,
          reference: t.reference,
        }))

        await transactionStore.saveBankTransactions(effectiveProcessingMonth, transactions, accountNumber, effectiveFileId)
        return transactions.length
      }
    }

    // Fallback: deterministic FIBI column-mapping parser (kept for XLS where LLM
    // returned no bank transactions, and as the path for PDF files).
    const rows = await readFinancialFile(file)

    const cardTypeIndicators = await getCardTypeIndicators()

    const parsed = parseBankWithRegistry(rows, cardTypeIndicators)
    const accountNumber = parsed.accountNumber

    if (!accountNumber) {
      throw new Error('Could not extract account number from file')
    }

    const transactions = parsed.transactions

    const effectiveProcessingMonth = processingMonth || parsed.processingMonth || ''
    const effectiveFileId = fileId || `bank-${effectiveProcessingMonth}`

    await transactionStore.saveBankTransactions(effectiveProcessingMonth, transactions, accountNumber, effectiveFileId)

    return transactions.length
  },
}
