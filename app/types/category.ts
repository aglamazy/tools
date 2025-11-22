export type CategoryType = 'income' | 'expense'

export type Category = {
  id: string
  name: string
  type: CategoryType
  color: string
  createdAt: string
}

export type Classification = {
  transactionId: string
  categoryId: string
  monthYear: string // "MM/YYYY" format
  classifiedAt: string
}

export type CategoryStorage = {
  version: string
  categories: Category[]
  classifications: Classification[]
  lastUpdated: string
}
