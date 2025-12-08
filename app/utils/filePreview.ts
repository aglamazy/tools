import { readExcelFile } from './excelReader'
import { classifyFile } from './fileClassifier'
import { extractCreditCardPreview } from './creditCardParser'
import { extractBankPreview, extractBankPreviewAsync } from './bankParser'
import { FileType } from '@/app/types/file-type'

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
export const extractFileMetadata = async (file: File): Promise<FileMetadata> => {
  try {
    // Step 1: Read the Excel file
    const rows = await readExcelFile(file)

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
  } catch (err) {
    console.error('Error extracting file metadata:', err)
    return {
      fileType: FileType.Unknown,
      transactionCount: 0,
    }
  }
}
