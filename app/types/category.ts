export type CategoryType = 'income' | 'expense'

export type Category = {
  id: string
  name: string
  type: CategoryType
  color: string
  createdAt: string
  isFixed?: boolean
  isCapital?: boolean
  isExternal?: boolean
  isDeductible?: boolean // הוצאה מוכרת — counts as a tax-deductible business expense
  deductiblePercent?: number // 1-100, only meaningful when isDeductible is true
  businessId?: number // Maps category to a business (business scope)
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
