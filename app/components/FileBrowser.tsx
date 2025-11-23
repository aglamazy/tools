'use client'

import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import type { SheetRow } from '@/app/types/transactions'
import type { FilePreview } from '@/app/types/file-preview'
import { extractCreditCardPreview } from '@/app/utils/creditCardParser'
import { requestDirectoryPermission } from '@/app/utils/directoryStorage'

type FileBrowserProps = {
  onFileSelect: (file: File) => void
  isOpen?: boolean
  savedDirHandle: FileSystemDirectoryHandle | null
  onDirHandleChange: (handle: FileSystemDirectoryHandle | null) => void
}

const normalizeCell = (value: string | number | null | undefined): string | number => {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number') {
    return value
  }
  return ''
}

const parseTransactionDate = (dateStr: string): { month: string; year: string } | null => {
  const match = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (match) {
    const [, , month, year] = match
    return { month, year }
  }
  return null
}

const detectFileType = (rows: Array<Array<string | number>>): 'fibi-transactions' | 'credit-card' | 'unknown' => {
  // Check for FIBI bank transactions (has "חובה" and "זכות" columns)
  const hasFibiHeaders = rows.some((row) =>
    row.some((cell) => typeof cell === 'string' && cell.includes('תאריך')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('חובה')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('זכות'))
  )

  if (hasFibiHeaders) {
    return 'fibi-transactions'
  }

  // Check for credit card statement (has "סכום חיוב" and "פירוט" columns)
  const hasCreditCardHeaders = rows.some((row) =>
    row.some((cell) => typeof cell === 'string' && cell.includes('סכום חיוב')) &&
    row.some((cell) => typeof cell === 'string' && cell.includes('פירוט'))
  )

  if (hasCreditCardHeaders) {
    return 'credit-card'
  }

  return 'unknown'
}

const extractFilePreview = async (file: File): Promise<Partial<FilePreview>> => {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    const workbook = XLSX.read(data, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
      header: 1,
      raw: false,
    })

    const sanitized = rows.map((row) => row.map(normalizeCell)) as Array<Array<string | number>>
    const fileType = detectFileType(sanitized)

    if (fileType === 'credit-card') {
      const creditPreview = extractCreditCardPreview(rows)
      return {
        fileType: 'credit-card',
        processingMonth: creditPreview.processingMonth,
        transactionCount: creditPreview.paymentCount,
        cardNumber: creditPreview.cardNumber,
        accountNumber: null,
      }
    }

    if (fileType === 'fibi-transactions') {
      // Extract account number from header rows
      let accountNumber: string | null = null

      for (let i = 0; i < Math.min(4, sanitized.length); i++) {
        for (const cell of sanitized[i]) {
          if (typeof cell === 'string') {
            const accountMatch = cell.match(/(\d{3}-\d{6})/)
            if (accountMatch && !accountNumber) {
              accountNumber = accountMatch[1]
            }
          }
        }
      }

      // Find header row and get first transaction date
      const headerIndex = sanitized.findIndex((row) =>
        row.some((cell) => typeof cell === 'string' && cell.includes('תאריך')) &&
        row.some((cell) => typeof cell === 'string' && cell.includes('חובה'))
      )

      let transactionCount = 0
      let processingMonth: string | null = null

      if (headerIndex !== -1) {
        const rowsAfterHeader = sanitized.slice(headerIndex + 1)
        const headers = sanitized[headerIndex]
        const dateIdx = headers.findIndex((cell) => typeof cell === 'string' && cell.includes('תאריך'))
        const descriptionIdx = headers.findIndex((cell) => typeof cell === 'string' && cell.includes('תיאור'))

        if (dateIdx !== -1 && descriptionIdx !== -1) {
          const validTransactions = rowsAfterHeader.filter((row) => {
            const date = row[dateIdx]
            const description = row[descriptionIdx]
            if (!date || !description) return false
            if (typeof description === 'string' && description.includes('יתרת חודש קודם')) return false
            return true
          })

          transactionCount = validTransactions.length

          if (validTransactions.length > 0) {
            const firstDate = validTransactions[0][dateIdx]
            const parsedDate = parseTransactionDate(String(firstDate))
            if (parsedDate) {
              processingMonth = `${parsedDate.month}/${parsedDate.year}`
            }
          }
        }
      }

      return {
        fileType: 'fibi-transactions',
        processingMonth,
        transactionCount,
        accountNumber,
        cardNumber: null,
      }
    }

    return {
      fileType: 'unknown',
    }
  } catch (err) {
    console.error('Error extracting file preview:', err)
    return {
      fileType: 'unknown',
    }
  }
}

export default function FileBrowser({ onFileSelect, isOpen, savedDirHandle, onDirHandleChange }: FileBrowserProps) {
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Auto-load files when modal opens using the saved directory from settings
  useEffect(() => {
    const run = async () => {
      if (!isOpen) return
      if (!savedDirHandle) {
        setError('לא הוגדרה תיקייה בהגדרות. עבור למסך ההגדרות כדי לבחור תיקייה.')
        setPreviews([])
        return
      }

      setError('')
      const hasPermission = await requestDirectoryPermission(savedDirHandle, 'read')
      if (!hasPermission) {
        setError('אין הרשאה לתיקייה. פתח את התיקייה במסך ההגדרות ואשר גישה.')
        onDirHandleChange(null)
        setPreviews([])
        setLoading(false)
        return
      }

      await loadFilesFromDirectory(savedDirHandle)
    }

    run()
  }, [isOpen, savedDirHandle])

  const loadFilesFromDirectory = async (dirHandle: FileSystemDirectoryHandle) => {
    setLoading(true)
    setError('')
    setPreviews([])

    try {
      const fileHandles: FileSystemFileHandle[] = []

      // Collect all .xls and .xlsx files
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const fileName = entry.name.toLowerCase()
          if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
            fileHandles.push(entry)
          }
        }
      }

      // Generate previews
      const previewPromises = fileHandles.map(async (fileHandle) => {
        const file = await fileHandle.getFile()
        const preview = await extractFilePreview(file)

        return {
          fileName: fileHandle.name,
          fileHandle,
          fileType: preview.fileType || 'unknown',
          processingMonth: preview.processingMonth || null,
          transactionCount: preview.transactionCount || 0,
          accountNumber: preview.accountNumber || null,
          cardNumber: preview.cardNumber || null,
        } as FilePreview
      })

      const filePreviews = await Promise.all(previewPromises)
      setPreviews(filePreviews.filter((p) => p.fileType === 'fibi-transactions' || p.fileType === 'credit-card'))
      setLoading(false)
    } catch (err: any) {
      console.error('Error loading files:', err)
      setError('אירעה שגיאה בקריאת הקבצים.')
      setLoading(false)
    }
  }

  const handleSelectFile = async (preview: FilePreview) => {
    const file = await preview.fileHandle.getFile()
    onFileSelect(file)
  }

  const formatMonthDisplay = (monthStr: string | null): string => {
    if (!monthStr) return 'לא זוהה'
    const [month, year] = monthStr.split('/')
    const monthNames = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ]
    const monthName = monthNames[parseInt(month, 10) - 1]
    return `${monthName} ${year}`
  }

  return (
    <div>
      {!savedDirHandle && (
        <div className="banner warning" style={{ marginBottom: '1rem' }}>
          לא הוגדרה תיקייה. עבור למסך ההגדרות כדי לבחור תיקייה עבור קבצי הבנק/אשראי.
        </div>
      )}
      {loading && (
        <div className="banner" style={{ marginBottom: '1rem' }}>
          טוען קבצים מהתיקייה...
        </div>
      )}
      {error && <div className="banner error" style={{ marginTop: '1rem' }}>{error}</div>}

      {previews.length > 0 && (
        <div className="file-preview-grid">
          {previews.map((preview, index) => (
            <div
              key={index}
              className="file-preview-card"
              onClick={() => handleSelectFile(preview)}
            >
              <div className="file-preview-header">
                <div className="file-preview-icon">
                  {preview.fileType === 'credit-card' ? '💳' : '📄'}
                </div>
                <div className="file-preview-name">{preview.fileName}</div>
              </div>
              <div className="file-preview-details">
                <div className="file-preview-detail">
                  <span className="detail-label">חודש:</span>
                  <span className="detail-value">{formatMonthDisplay(preview.processingMonth)}</span>
                </div>
                {preview.cardNumber && (
                  <div className="file-preview-detail">
                    <span className="detail-label">כרטיס:</span>
                    <span className="detail-value">{preview.cardNumber}</span>
                  </div>
                )}
                {preview.accountNumber && (
                  <div className="file-preview-detail">
                    <span className="detail-label">חשבון:</span>
                    <span className="detail-value">{preview.accountNumber}</span>
                  </div>
                )}
                <div className="file-preview-detail">
                  <span className="detail-label">
                    {preview.fileType === 'credit-card' ? 'תשלומים:' : 'עסקאות:'}
                  </span>
                  <span className="detail-value">{preview.transactionCount}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {savedDirHandle && !loading && !error && previews.length === 0 && (
        <div className="banner" style={{ marginTop: '1rem' }}>
          לא נמצאו קבצי XLS/XLSX בתיקייה שנבחרה.
        </div>
      )}
    </div>
  )
}
