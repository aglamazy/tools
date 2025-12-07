import { readExcelFile } from '@/app/utils/excelReader'
import { parseCreditCardStatement } from '@/app/utils/creditCardParser'
import { parseBankTransactions, extractAccountNumber } from '@/app/utils/bankParser'
import { transactionStore } from '@/app/stores/transactionStore'

export const fileImportService = {
  // Import credit card file
  importCreditCardFile: async (file: File, cardNumber: string, billingDate: Date | null, fileId?: string) => {
    // Read Excel file
    const rows = await readExcelFile(file)

    // Parse credit card data
    const statement = parseCreditCardStatement(rows)

    // Use billing date from file (when these transactions are charged)
    // This is critical: ALL transactions in this file are charged in this billing month
    const effectiveBillingDate = statement.billingDate || billingDate

    // Format charging date (DD/MM/YYYY format)
    const chargingDateStr = effectiveBillingDate
      ? `${String(effectiveBillingDate.getDate()).padStart(2, '0')}/${String(effectiveBillingDate.getMonth() + 1).padStart(2, '0')}/${effectiveBillingDate.getFullYear()}`
      : undefined

    // Extract processing month from billing date (MM/YYYY)
    const processingMonth = effectiveBillingDate
      ? `${String(effectiveBillingDate.getMonth() + 1).padStart(2, '0')}/${effectiveBillingDate.getFullYear()}`
      : ''

    console.log('💳 Importing credit card file with charging date:', chargingDateStr, 'processing month:', processingMonth)

    // Generate fileId if not provided
    const effectiveFileId = fileId || `credit-${cardNumber}-${processingMonth}`

    // Save to store - all payments get the same charging date
    await transactionStore.saveCreditCardData(cardNumber, statement.payments, chargingDateStr || '', processingMonth, effectiveFileId)

    return statement.payments.length
  },

  // Import bank file
  importBankFile: async (file: File, processingMonth: string, fileId?: string) => {
    // Read Excel file
    const rows = await readExcelFile(file)

    // Extract account number
    const accountNumber = extractAccountNumber(rows)
    if (!accountNumber) {
      throw new Error('Could not extract account number from file')
    }

    // Parse bank transactions
    const transactions = parseBankTransactions(rows, accountNumber)

    // Generate fileId if not provided
    const effectiveFileId = fileId || `bank-${processingMonth}`

    // Save to store
    await transactionStore.saveBankTransactions(processingMonth, transactions, accountNumber, effectiveFileId)

    return transactions.length
  },
}
