export type SheetCell = string | number | null | undefined
export type SheetRow = SheetCell[]

export type Transaction = {
  id: string
  date: string
  description: string
  amount: number
  type: string
  activity: string
  balance: number
  cardNumber?: string | null
  isCreditCardCharge?: boolean
}

export type ParseResult = {
  transactions: Transaction[]
  processingMonth: string | null
}

export type TransactionStorage = {
  version: string
  processingMonth: string | null
  transactions: Transaction[]
  creditCardData: {
    cardNumber: string
    payments: Array<{
      id: string
      transactionDate: string
      merchant: string
      amount: number
      currentStep: number
      totalSteps: number
    }>
  }[]
  loadedFiles: string[]
  lastUpdated: string
}
