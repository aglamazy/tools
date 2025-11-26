import * as XLSX from 'xlsx'
import { parseCreditCardStatement } from '@/app/utils/creditCardParser'
import { parseFibiTransactions } from '@/app/utils/fibiParser'
import { transactionStore } from '@/app/stores/transactionStore'

export const fileImportService = {
  // Import credit card file
  importCreditCardFile: async (file: File, cardNumber: string, billingDate: Date | null) => {
    // Read Excel file
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    const workbook = XLSX.read(data, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as import('@/app/types/transactions').SheetRow[]

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
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    const workbook = XLSX.read(data, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as import('@/app/types/transactions').SheetRow[]

    // Parse bank transactions
    const transactions = parseFibiTransactions(rows)

    // Save to store
    transactionStore.saveBankTransactions(processingMonth, transactions)

    return transactions.length
  },
}
