'use client'

import { useState, useEffect } from 'react'
import type { FilePreview } from '@/app/types/file-preview'
import { FileType } from '@/app/types/file-type'
import { extractFileMetadata } from '@/app/utils/filePreview'
import { requestDirectoryPermission } from '@/app/utils/directoryStorage'

type FileBrowserProps = {
  onFileSelect: (file: File) => void
  isOpen?: boolean
  savedDirHandle: FileSystemDirectoryHandle | null
  onDirHandleChange: (handle: FileSystemDirectoryHandle | null) => void
  excludeFileNames?: string[]
  showDebug?: boolean
  onDebugInspect?: (preview: FilePreview, file: File) => void
}

const extractFilePreview = async (file: File): Promise<Partial<FilePreview>> => {
  const metadata = await extractFileMetadata(file)
  return {
    fileType: metadata.fileType,
    processingMonth: metadata.processingMonth || null,
    transactionCount: metadata.transactionCount,
    accountNumber: metadata.accountNumber || null,
    cardNumber: metadata.cardNumber || null,
  }
}

export default function FileBrowser({
  onFileSelect,
  isOpen,
  savedDirHandle,
  onDirHandleChange,
  excludeFileNames,
  showDebug,
  onDebugInspect,
}: FileBrowserProps) {
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Auto-load files when modal opens using the saved directory from settings
  useEffect(() => {
    const run = async () => {
      if (!isOpen) return
      if (!savedDirHandle) {
        // No folder selected yet - show folder selection UI
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
      // TypeScript's built-in types don't include entries() for FileSystemDirectoryHandle, so we cast
      const dirHandleWithEntries = dirHandle as FileSystemDirectoryHandle & {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>
      }

      for await (const [, entry] of dirHandleWithEntries.entries()) {
        if (entry.kind === 'file') {
          const fileName = entry.name.toLowerCase()
          if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
            fileHandles.push(entry as FileSystemFileHandle)
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
          fileType: preview.fileType || FileType.Unknown,
          processingMonth: preview.processingMonth || null,
          transactionCount: preview.transactionCount || 0,
          accountNumber: preview.accountNumber || null,
          cardNumber: preview.cardNumber || null,
        } as FilePreview
      })

      const filePreviews = await Promise.all(previewPromises)
      const exclude = new Set((excludeFileNames || []).map((n) => n.toLowerCase()))
      const validPreviews = filePreviews
        .filter((p) => p.fileType === FileType.Bank || p.fileType === FileType.CreditCard)
        .filter((p) => !exclude.has(p.fileName.toLowerCase()))

      // Sort by month (descending), then by account
      validPreviews.sort((a, b) => {
        // Parse month/year for comparison
        const parseMonthYear = (monthStr: string | null): number => {
          if (!monthStr) return 0
          const [month, year] = monthStr.split('/').map(v => parseInt(v, 10))
          return year * 12 + month
        }

        const aMonth = parseMonthYear(a.processingMonth)
        const bMonth = parseMonthYear(b.processingMonth)

        if (aMonth !== bMonth) {
          return bMonth - aMonth // Descending (newest first)
        }

        // Same month - sort by account/card number
        const aAccount = a.accountNumber || a.cardNumber || ''
        const bAccount = b.accountNumber || b.cardNumber || ''
        return aAccount.localeCompare(bAccount)
      })

      setPreviews(validPreviews)
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

  const handleDebug = async (preview: FilePreview) => {
    if (!onDebugInspect) return
    const file = await preview.fileHandle.getFile()
    onDebugInspect(preview, file)
  }

  const handleSelectFolder = async () => {
    try {
      // Request directory picker
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read',
        startIn: 'downloads', // Suggest Downloads folder
      })

      if (dirHandle) {
        onDirHandleChange(dirHandle)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled - that's ok
        return
      }
      console.error('Error selecting folder:', err)
      setError('שגיאה בבחירת תיקייה')
    }
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
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          background: '#eff6ff',
          border: '1px solid #93c5fd',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', color: '#1e40af' }}>
            בחר תיקייה לקבצים
          </h3>
          <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.875rem', color: '#1e3a8a' }}>
            בחר את תיקיית ההורדות (Downloads) שבה נמצאים קבצי הבנק וכרטיסי האשראי שלך
          </p>
          <button
            onClick={handleSelectFolder}
            className="file-picker"
            style={{ margin: '0 auto' }}
          >
            📂 בחר תיקייה
          </button>
        </div>
      )}
      {loading && (
        <div className="banner" style={{ marginBottom: '1rem' }}>
          טוען קבצים מהתיקייה...
        </div>
      )}
      {error && <div className="banner error" style={{ marginTop: '1rem' }}>{error}</div>}

      {previews.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>שם קובץ</th>
                <th>תאריך</th>
                <th>חשבון</th>
                <th>מספר עסקה</th>
                {showDebug && <th>Dev</th>}
              </tr>
            </thead>
            <tbody>
              {previews.map((preview, index) => (
                <tr
                  key={index}
                  onClick={() => handleSelectFile(preview)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{preview.fileType === FileType.CreditCard ? '💳' : '📄'}</span>
                      <span>{preview.fileName}</span>
                    </div>
                  </td>
                  <td>{formatMonthDisplay(preview.processingMonth)}</td>
                  <td>{preview.accountNumber || preview.cardNumber || '—'}</td>
                  <td>{preview.transactionCount}</td>
                  {showDebug && (
                    <td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDebug(preview)
                        }}
                        className="upload-another-btn"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                      >
                        🔍
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
