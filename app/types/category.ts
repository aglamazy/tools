export type CategoryType = 'income' | 'expense'

export type Category = {
  id: string
  name: string
  type: CategoryType
  color: string
  createdAt: string
  isFixed?: boolean
  parentId?: string // If this is a sub-category, reference to parent category
  subCategories?: string[] // IDs of sub-categories (for parent categories)
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
