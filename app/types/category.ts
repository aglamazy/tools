export type CategoryType = 'income' | 'expense'

export type Category = {
  id: string
  name: string
  type: CategoryType
  color: string
  createdAt: string
  isFixed?: boolean
}

export type Classification = {
  transactionId: string
  categoryId: string
  monthYear: string // "MM/YYYY" format
  classifiedAt: string
  // Optional fields for reuse across months
  descriptionKey?: string
  amount?: number
  sign?: 'income' | 'expense'
  matchDeltaPct?: number
  matchSourceMonthYear?: string
  amountChangeWarningPct?: number
}

export type CategoryStorage = {
  version: string
  categories: Category[]
  classifications: Classification[]
  lastUpdated: string
}
