import { readFinancialFile } from '@/app/utils/financialFileReader'
import { parseCreditWithRegistry } from '@/app/utils/creditCardParser'
import { parseBankWithRegistry } from '@/app/utils/bankParser'
import { transactionStore } from '@/app/stores/transactionStore'
import { getCardTypeIndicators } from '@/app/services/appSettingsService'
import { normalizeDate } from '@/app/utils/parsers/shared'

export const fileImportService = {
  // Import credit card file
  importCreditCardFile: async (file: File, cardNumber: string, billingDate: Date | null, fileId?: string) => {
    // Read financial file (XLS/XLSX or PDF)
    const rows = await readFinancialFile(file)

    // Parse credit card data via registry (issuer-aware)
    const parsed = parseCreditWithRegistry(rows)
    const statement = parsed.statement
    const cardNumberToUse = parsed.cardNumber || cardNumber

    if (!cardNumberToUse) {
      throw new Error('Could not determine card number for credit card file')
    }
    if (!rows.length) {
      throw new Error("Can't find transactions");
    }

    // Use billing date from file (when these transactions are charged)
    // This is critical: ALL transactions in this file are charged in this billing month
    const effectiveBillingDate = statement.billingDate || billingDate

    // Format charging date in canonical YYYY-MM-DD form
    const chargingDateStr = effectiveBillingDate
      ? normalizeDate(
          `${String(effectiveBillingDate.getDate()).padStart(2, '0')}/${String(effectiveBillingDate.getMonth() + 1).padStart(2, '0')}/${effectiveBillingDate.getFullYear()}`
        )
      : undefined

    // Extract processing month from billing date (MM/YYYY)
    const processingMonth =
      parsed.processingMonth ||
      (effectiveBillingDate
        ? `${String(effectiveBillingDate.getMonth() + 1).padStart(2, '0')}/${effectiveBillingDate.getFullYear()}`
        : '')

    // Generate fileId if not provided
    const effectiveFileId = fileId || `credit-${cardNumberToUse}-${processingMonth}`

    // Save to store - all payments get the same charging date
    await transactionStore.saveCreditCardData(cardNumberToUse, statement.payments, chargingDateStr || '', processingMonth, effectiveFileId)

    return statement.payments.length
  },

  // Import bank file
  importBankFile: async (file: File, processingMonth: string, fileId?: string) => {
    // Read financial file (XLS/XLSX or PDF)
    const rows = await readFinancialFile(file)

    // Get card type indicators from settings
    const cardTypeIndicators = await getCardTypeIndicators()

    // Parse bank transactions via registry (issuer-aware)
    const parsed = parseBankWithRegistry(rows, cardTypeIndicators)
    const accountNumber = parsed.accountNumber

    if (!accountNumber) {
      throw new Error('Could not extract account number from file')
    }

    const transactions = parsed.transactions

    // Generate fileId if not provided
    const effectiveProcessingMonth = processingMonth || parsed.processingMonth || ''
    const effectiveFileId = fileId || `bank-${effectiveProcessingMonth}`

    // Save to store
    await transactionStore.saveBankTransactions(effectiveProcessingMonth, transactions, accountNumber, effectiveFileId)

    return transactions.length
  },
}
