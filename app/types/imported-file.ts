export type ImportedFile = {
  id: string
  fileName: string
  importDate: string // ISO date string
  fileType: 'bank' | 'credit-card'
  processingMonth?: string // MM/YYYY format
  accountNumber?: string
  cardNumber?: string
  transactionCount: number
}

export type ImportedFilesData = {
  version: string
  files: ImportedFile[]
  lastUpdated: string
}
