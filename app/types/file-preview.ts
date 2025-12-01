import { FileType } from './file-type'

export type FilePreview = {
  fileName: string
  fileHandle: FileSystemFileHandle
  fileType: FileType
  processingMonth: string | null
  transactionCount: number
  accountNumber: string | null
  cardNumber: string | null
}
