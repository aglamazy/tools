'use client'

import { useState, useEffect } from 'react'
import type { ImportedFile } from '@/app/types/imported-file'
import { formatMonthDisplay, formatDateTime } from '@/app/utils/formatters'
import FileBrowser from '@/app/components/FileBrowser'
import MessageModal from '@/app/components/MessageModal'
import YesNoModal from '@/app/components/YesNoModal'
import { useToast } from '@/app/components/ToastContainer'
import { loadDirectoryHandle, persistDirectoryHandle } from '@/app/utils/directoryStorage'

export default function ImportPage() {
  const { showToast } = useToast()
  const [files, setFiles] = useState<ImportedFile[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [savedDirHandle, setSavedDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [showFileBrowser, setShowFileBrowser] = useState(false)

  // Modal states
  const [messageModal, setMessageModal] = useState<{ isOpen: boolean; emoji?: string; message: string }>({
    isOpen: false,
    message: '',
  })
  const [yesNoModal, setYesNoModal] = useState<{
    isOpen: boolean
    question: string
    onConfirm: () => void
  }>({
    isOpen: false,
    question: '',
    onConfirm: () => {},
  })

  // Load directory handle and imported files from storage
  useEffect(() => {
    const loadData = async () => {
      const dirHandle = await loadDirectoryHandle()
      setSavedDirHandle(dirHandle)

      // Load imported files from localStorage
      const stored = localStorage.getItem('finance-imported-files')
      if (stored) {
        const data = JSON.parse(stored)
        const loadedFiles = data.files || []
        setFiles(loadedFiles)

        // Auto-select newest month
        if (loadedFiles.length > 0) {
          const months = Array.from(
            new Set(loadedFiles.map((f: ImportedFile) => f.processingMonth).filter((m): m is string => !!m))
          ).sort((a, b) => {
            const [aMonth, aYear] = a.split('/').map(Number)
            const [bMonth, bYear] = b.split('/').map(Number)
            return (bYear * 12 + bMonth) - (aYear * 12 + aMonth)
          })
          if (months.length > 0) {
            setSelectedMonth(months[0]) // Select newest month
          }
        }
      }
    }
    loadData()
  }, [])

  const handleDirHandleChange = async (handle: FileSystemDirectoryHandle | null) => {
    setSavedDirHandle(handle)
    if (handle) {
      await persistDirectoryHandle(handle)
    }
  }

  const handleDeleteFile = (fileId: string) => {
    const fileToDelete = files.find((f) => f.id === fileId)
    setYesNoModal({
      isOpen: true,
      question: 'האם אתה בטוח שברצונך למחוק את הקובץ?',
      onConfirm: () => {
        // Remove from localStorage
        const stored = localStorage.getItem('finance-imported-files')
        if (stored) {
          const data = JSON.parse(stored)
          data.files = data.files.filter((f: ImportedFile) => f.id !== fileId)
          data.lastUpdated = new Date().toISOString()
          localStorage.setItem('finance-imported-files', JSON.stringify(data))

          // Update state
          setFiles(data.files)

          // Clear month filter if no files for selected month
          if (selectedMonth) {
            const hasFilesInMonth = data.files.some((f: ImportedFile) => f.processingMonth === selectedMonth)
            if (!hasFilesInMonth) {
              setSelectedMonth('')
            }
          }

          showToast('success', `הקובץ "${fileToDelete?.fileName || ''}" נמחק בהצלחה`)
        }
        setYesNoModal({ isOpen: false, question: '', onConfirm: () => {} })
      },
    })
  }

  const handleFileSelect = async (file: File) => {
    try {
      // Extract file metadata
      const { extractFileMetadata } = await import('@/app/utils/filePreview')
      const metadata = await extractFileMetadata(file)

      if (metadata.fileType === 'unknown') {
        setMessageModal({
          isOpen: true,
          emoji: '❌',
          message: 'לא ניתן לזהות את סוג הקובץ. אנא ודא שזהו קובץ בנק FIBI או כרטיס אשראי.',
        })
        return
      }

      // Create imported file record
      const importedFile: ImportedFile = {
        id: `${Date.now()}-${file.name}`,
        fileName: file.name,
        importDate: new Date().toISOString(),
        fileType: metadata.fileType,
        processingMonth: metadata.processingMonth,
        accountNumber: metadata.accountNumber,
        cardNumber: metadata.cardNumber,
        transactionCount: metadata.transactionCount,
      }

      // Save to localStorage
      const stored = localStorage.getItem('finance-imported-files')
      const existingData = stored ? JSON.parse(stored) : { version: '1.0', files: [], lastUpdated: '' }

      // Check for duplicates
      const isDuplicate = existingData.files.some(
        (f: ImportedFile) => f.fileName === importedFile.fileName && f.processingMonth === importedFile.processingMonth
      )

      if (isDuplicate) {
        setYesNoModal({
          isOpen: true,
          question: `הקובץ "${file.name}" כבר קיים. האם להחליף אותו?`,
          onConfirm: () => {
            // Remove old version
            existingData.files = existingData.files.filter(
              (f: ImportedFile) => !(f.fileName === importedFile.fileName && f.processingMonth === importedFile.processingMonth)
            )

            existingData.files.push(importedFile)
            existingData.lastUpdated = new Date().toISOString()
            localStorage.setItem('finance-imported-files', JSON.stringify(existingData))

            // Update state
            setFiles(existingData.files)
            setShowFileBrowser(false)

            // Set filter to the imported file's month
            if (metadata.processingMonth) {
              setSelectedMonth(metadata.processingMonth)
            }

            setYesNoModal({ isOpen: false, question: '', onConfirm: () => {} })
            showToast('success', `הקובץ "${file.name}" יובא בהצלחה!`)
          },
        })
        return
      }

      existingData.files.push(importedFile)
      existingData.lastUpdated = new Date().toISOString()
      localStorage.setItem('finance-imported-files', JSON.stringify(existingData))

      // Update state
      setFiles(existingData.files)
      setShowFileBrowser(false)

      // Set filter to the imported file's month
      if (metadata.processingMonth) {
        setSelectedMonth(metadata.processingMonth)
      }

      showToast('success', `הקובץ "${file.name}" יובא בהצלחה!`)
    } catch (err) {
      console.error('Error importing file:', err)
      showToast('error', 'אירעה שגיאה בייבוא הקובץ.')
    }
  }

  // Extract unique months from files, sorted newest first
  const availableMonths = Array.from(
    new Set(files.map((f) => f.processingMonth).filter((m): m is string => !!m))
  ).sort((a, b) => {
    const [aMonth, aYear] = a.split('/').map(Number)
    const [bMonth, bYear] = b.split('/').map(Number)
    return (bYear * 12 + bMonth) - (aYear * 12 + aMonth) // Descending order (newest first)
  })

  // Filter files by selected month
  const filteredFiles = selectedMonth
    ? files.filter((f) => f.processingMonth === selectedMonth)
    : files

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>ייבוא קבצים</h1>
          <p>טען קבצי בנק וכרטיסי אשראי לאחסון ועיבוד מאוחר יותר</p>
        </header>

        {/* Import button */}
        <button onClick={() => setShowFileBrowser(true)} className="file-picker">
          <span>📥 ייבא קובץ חדש</span>
        </button>

        {/* File browser modal */}
        {showFileBrowser && (
          <div className="modal-overlay" onClick={() => setShowFileBrowser(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>בחר קובץ לייבוא</h2>
                <button className="modal-close" onClick={() => setShowFileBrowser(false)}>
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <FileBrowser
                  onFileSelect={handleFileSelect}
                  isOpen={showFileBrowser}
                  savedDirHandle={savedDirHandle}
                  onDirHandleChange={handleDirHandleChange}
                />
              </div>
            </div>
          </div>
        )}

        {/* Month filter */}
        {files.length > 0 && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
            <label htmlFor="month-filter" style={{ marginLeft: '0.5rem', fontWeight: 500 }}>
              סנן לפי חודש:
            </label>
            <select
              id="month-filter"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
              }}
            >
              <option value="">כל החודשים</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {formatMonthDisplay(month)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Files table */}
        {filteredFiles.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>שם קובץ</th>
                  <th>תאריך ייבוא</th>
                  <th>סוג</th>
                  <th>חודש</th>
                  <th>חשבון</th>
                  <th>עסקאות</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{file.fileType === 'credit-card' ? '💳' : '📄'}</span>
                        <span>{file.fileName}</span>
                      </div>
                    </td>
                    <td>{formatDateTime(file.importDate)}</td>
                    <td>{file.fileType === 'bank' ? 'בנק' : 'כרטיס אשראי'}</td>
                    <td>{file.processingMonth ? formatMonthDisplay(file.processingMonth) : '—'}</td>
                    <td>{file.accountNumber || file.cardNumber || '—'}</td>
                    <td>{file.transactionCount}</td>
                    <td>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="upload-another-btn"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      >
                        🗑️ מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="banner" style={{ marginTop: '1rem' }}>
            {selectedMonth
              ? `לא נמצאו קבצים עבור ${formatMonthDisplay(selectedMonth)}`
              : 'לא נמצאו קבצים מיובאים. לחץ על "ייבא קובץ חדש" להתחיל.'}
          </div>
        )}
      </div>

      {/* Modals */}
      <MessageModal
        isOpen={messageModal.isOpen}
        emoji={messageModal.emoji}
        message={messageModal.message}
        onClose={() => setMessageModal({ isOpen: false, message: '' })}
      />
      <YesNoModal
        isOpen={yesNoModal.isOpen}
        question={yesNoModal.question}
        onYes={yesNoModal.onConfirm}
        onNo={() => setYesNoModal({ isOpen: false, question: '', onConfirm: () => {} })}
      />
    </main>
  )
}
