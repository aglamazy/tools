import { readFinancialFile, type PdfReadProgress } from './financialFileReader'
import { classifyFile } from './fileClassifier'
import { extractCreditCardPreview } from './creditCardParser'
import { extractBankPreview, extractBankPreviewAsync } from './bankParser'
import { FileType } from '@/app/types/file-type'

export type { PdfReadProgress }

export type FileMetadata = {
  fileType: FileType
  processingMonth?: string
  accountNumber?: string
  cardNumber?: string
  transactionCount: number
}

/**
 * Extract metadata from a financial file for preview purposes.
 * Uses the centralized architecture: reader → classifier → parser preview
 */
export const extractFileMetadata = async (file: File, onProgress?: (p: PdfReadProgress) => void): Promise<FileMetadata> => {
  // Step 1: Read the financial file (XLS/XLSX or PDF). Let read/extraction
  // errors (e.g. PDF extraction validation failures) propagate to the
  // caller instead of collapsing them into FileType.Unknown — a failed
  // extraction and a genuinely-unrecognized file are different problems
  // and need different error messages (was #251 follow-up: a chunk's 422
  // zero-amount error was being shown to the user as "unknown file type").
  const rows = await readFinancialFile(file, onProgress)

  // Step 2: Classify the file type
  const fileType = classifyFile(rows)

  // Step 3: Extract preview using the appropriate parser
  switch (fileType) {
    case FileType.CreditCard: {
      const preview = extractCreditCardPreview(rows)
      return {
        fileType: FileType.CreditCard,
        processingMonth: preview.processingMonth || undefined,
        cardNumber: preview.cardNumber || undefined,
        transactionCount: preview.paymentCount,
      }
    }

    case FileType.Bank: {
      const preview = await extractBankPreviewAsync(rows)
      return {
        fileType: FileType.Bank,
        processingMonth: preview.processingMonth || undefined,
        accountNumber: preview.accountNumber || undefined,
        transactionCount: preview.transactionCount,
      }
    }

    case FileType.Unknown:
    default:
      return {
        fileType: FileType.Unknown,
        transactionCount: 0,
      }
  }
}
