export type CategoryBreakdown = {
  categoryId: string
  categoryName: string
  type: 'income' | 'expense'
  color?: string
  total: number
  count: number
}

export type MonthSnapshot = {
  monthYear: string // "MM/YYYY"
  income: number
  expense: number
  net: number
  fileNames: string[]
  categories: CategoryBreakdown[]
  unclassifiedCount: number
  transactionCount: number
  lastUpdated: string
}

export type HistoryStorage = {
  version: string
  months: MonthSnapshot[]
  lastUpdated: string
}
