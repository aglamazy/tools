export type FilePreview = {
  fileName: string
  fileHandle: FileSystemFileHandle
  fileType: 'fibi-transactions' | 'credit-card' | 'unknown'
  processingMonth: string | null
  transactionCount: number
  accountNumber: string | null
  cardNumber: string | null
}
