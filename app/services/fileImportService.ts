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
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })

    // Parse credit card data
    const statement = parseCreditCardStatement(rows)

    // Format charging date
    const chargingDateStr = billingDate
      ? `${String(billingDate.getDate()).padStart(2, '0')}/${String(billingDate.getMonth() + 1).padStart(2, '0')}/${billingDate.getFullYear()}`
      : undefined

    // Save to store
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
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false })

    // Parse bank transactions
    const transactions = parseFibiTransactions(rows)

    // Save to store
    transactionStore.saveBankTransactions(processingMonth, transactions)

    return transactions.length
  },
}
