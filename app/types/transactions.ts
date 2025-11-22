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
