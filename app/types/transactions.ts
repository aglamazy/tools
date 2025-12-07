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
  accountNumber?: string | null
}

export type ParseResult = {
  transactions: Transaction[]
  processingMonth: string | null
}

export type CreditCardPayment = {
  id: string
  transactionDate: string
  merchant: string
  amount: number
  currentStep: number
  totalSteps: number
  category?: string
  isFixed?: boolean
  chargingDate?: string
}

export type CreditCardData = {
  cardNumber: string
  payments: CreditCardPayment[]
}

export type TransactionStorage = {
  version: string
  processingMonth: string | null
  transactions: Transaction[]
  creditCardData: CreditCardData[]
  loadedFiles: string[]
  lastUpdated: string
}

export type BudgetTransaction = {
  id: string
  date: string
  business: string
  category: string
  amount: number
  isFixed: boolean
  paymentMethod: string
  installmentInfo?: string
  totalAmount?: number
}

export type TransactionUpdate = {
  category?: string
  isFixed?: boolean
}
