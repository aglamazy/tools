import { FileType } from './file-type'

export type FilePreview = {
  fileName: string
  fileHandle: FileSystemFileHandle
  fileType: FileType
  processingMonth: string | null
  transactionCount: number
  accountNumber: string | null
  cardNumber: string | null
  /** OS file modification time (ms). Default sort key for the picker so the
   *  most recently downloaded statement floats to the top. */
  lastModified: number
}
