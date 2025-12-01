import { readExcelFile } from '@/app/utils/excelReader'
import { parseCreditCardStatement } from '@/app/utils/creditCardParser'
import { parseBankTransactions, extractAccountNumber } from '@/app/utils/bankParser'
import { transactionStore } from '@/app/stores/transactionStore'

export const fileImportService = {
  // Import credit card file
  importCreditCardFile: async (file: File, cardNumber: string, billingDate: Date | null) => {
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

    console.log('💳 Importing credit card file with charging date:', chargingDateStr)

    // Save to store - all payments get the same charging date
    transactionStore.saveCreditCardData(cardNumber, statement.payments, chargingDateStr)

    return statement.payments.length
  },

  // Import bank file
  importBankFile: async (file: File, processingMonth: string) => {
    // Read Excel file
    const rows = await readExcelFile(file)

    // Extract account number
    const accountNumber = extractAccountNumber(rows)
    if (!accountNumber) {
      throw new Error('Could not extract account number from file')
    }

    // Parse bank transactions
    const transactions = parseBankTransactions(rows, accountNumber)

    // Save to store
    transactionStore.saveBankTransactions(processingMonth, transactions)

    return transactions.length
  },
}
