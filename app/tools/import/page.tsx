'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ImportedFile } from '@/app/db/financeDB'
import { formatMonthDisplay, formatDateTime } from '@/app/utils/formatters'
import FileBrowser from '@/app/components/FileBrowser'
import MessageModal from '@/app/components/MessageModal'
import YesNoModal from '@/app/components/YesNoModal'
import { useToast } from '@/app/components/ToastContainer'
import { loadDirectoryHandle, persistDirectoryHandle } from '@/app/utils/directoryStorage'
import { transactionStore } from '@/app/stores/transactionStore'
import { config } from '@/app/config'
import { extractFileMetadata } from '@/app/utils/filePreview'
import { readExcelFile } from '@/app/utils/excelReader'
import { parseBankWithRegistry } from '@/app/utils/bankParser'
import { parseCreditWithRegistry } from '@/app/utils/creditCardParser'
import type { FilePreview } from '@/app/types/file-preview'
import { parseXlsTables } from '@/app/utils/xlsTableParser'

export default function ImportPage() {
  const searchParams = useSearchParams()
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
  const [viewModal, setViewModal] = useState<{
    isOpen: boolean
    file: ImportedFile | null
    transactions: any[]
  }>({
    isOpen: false,
    file: null,
    transactions: [],
  })
  const [debugModal, setDebugModal] = useState<{
    isOpen: boolean
    title: string
    metadata?: any
    parsed?: any
    tables?: any
    transactions?: any[]
  }>({
    isOpen: false,
    title: '',
  })

  // Load directory handle and imported files from storage
  useEffect(() => {
    const loadData = async () => {
      const dirHandle = await loadDirectoryHandle()
      setSavedDirHandle(dirHandle)

      // Load imported files from IndexedDB
      const data = await transactionStore.getImportedFiles()
      if (data) {
        const loadedFiles = data.files || []
        setFiles(loadedFiles)

        // Auto-select month from sessionStorage or newest
        if (loadedFiles.length > 0) {
          const months = Array.from(
            new Set<string>(loadedFiles.map((f: ImportedFile) => f.processingMonth).filter((m: string | null | undefined): m is string => !!m))
          ).sort((a, b) => {
            const [aMonth, aYear] = a.split('/').map(Number)
            const [bMonth, bYear] = b.split('/').map(Number)
            return (bYear * 12 + bMonth) - (aYear * 12 + aMonth)
          })
          if (months.length > 0) {
            // Check URL parameter first
            const monthParam = searchParams.get('month')
            if (monthParam && months.includes(monthParam)) {
              setSelectedMonth(monthParam)
            } else {
              // Try to restore from sessionStorage
              const savedMonth = sessionStorage.getItem('selectedMonth')
              if (savedMonth && months.includes(savedMonth)) {
                setSelectedMonth(savedMonth)
              } else {
                // Otherwise use newest month
                setSelectedMonth(months[0] as string)
              }
            }
          }
        }
      }
    }
    loadData()
  }, [searchParams])

  // Save selected month to sessionStorage when it changes
  useEffect(() => {
    if (selectedMonth) {
      sessionStorage.setItem('selectedMonth', selectedMonth)
    }
  }, [selectedMonth])

  const handleDirHandleChange = async (handle: FileSystemDirectoryHandle | null) => {
    setSavedDirHandle(handle)
    if (handle) {
      await persistDirectoryHandle(handle)
    }
  }

  const handleOpenFile = async (fileName: string) => {
    if (!savedDirHandle) {
      showToast('error', 'לא נמצאה תיקייה שמורה')
      return
    }

    try {
      // Get the file handle from the directory
      const fileHandle = await savedDirHandle.getFileHandle(fileName)
      const file = await fileHandle.getFile()

      // Create a temporary URL and open it
      const url = URL.createObjectURL(file)
      window.open(url, '_blank')

      // Clean up the URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      console.error('Error opening file:', err)
      showToast('error', 'לא ניתן לפתוח את הקובץ')
    }
  }

const handleViewFile = async (fileId: number | null, fileKey?: string) => {
  const file = fileId ? files.find((f) => f.id === fileId) : files.find((f) => f.fileKey === fileKey)
  if (!file) return

  // Load transactions from IndexedDB
  const transactions = fileKey
    ? await transactionStore.getTransactionsByFileKey(fileKey)
    : await transactionStore.getData(file.fileType, file.processingMonth, file.cardNumber)

  if (!transactions) {
    showToast('error', 'No transaction data found')
    return
  }

  setViewModal({
    isOpen: true,
    file,
    transactions,
  })
}

const handleDeleteFile = (file: ImportedFile) => {
  const fileId = file.id
  const fileToDelete = file
  setYesNoModal({
      isOpen: true,
      question: 'האם אתה בטוח שברצונך למחוק את הקובץ?',
      onConfirm: async () => {
        if (!fileToDelete) return

        // Delete transactions associated with this file
        await transactionStore.deleteTransactionsForFile(
          fileToDelete.fileType,
          fileToDelete.processingMonth || '',
          fileToDelete.cardNumber,
          fileToDelete.fileKey,
          fileToDelete.fileName
        )

        // Remove from imported files list
        if (fileId) {
          const data = await transactionStore.getImportedFiles()
          if (data) {
            data.files = data.files.filter((f: ImportedFile) => f.id !== fileId)
            data.lastUpdated = new Date().toISOString()
            await transactionStore.saveImportedFiles(data)

            // Update state
            setFiles(data.files)
          }
        } else {
          // Remove from state only (inferred file)
          setFiles((prev) => prev.filter((f) => f !== fileToDelete))
        }

        // Clear month filter if no files for selected month
        if (selectedMonth) {
          const remaining = fileId ? files.filter((f) => f.id !== fileId) : files.filter((f) => f !== fileToDelete)
          const hasFilesInMonth = remaining.some((f: ImportedFile) => f.processingMonth === selectedMonth)
          if (!hasFilesInMonth) {
            setSelectedMonth('')
          }
        }

        showToast('success', `הקובץ "${fileToDelete.fileName}" נמחק בהצלחה`)
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

      // Create file ID first (before importing)
      const fileId = `${Date.now()}-${file.name}`

      // Import and save transactions
      const { fileImportService } = await import('@/app/services/fileImportService')

      if (metadata.fileType === 'credit-card' && metadata.cardNumber) {
        await fileImportService.importCreditCardFile(file, metadata.cardNumber, null, fileId)
      } else if (metadata.fileType === 'bank' && metadata.processingMonth) {
        await fileImportService.importBankFile(file, metadata.processingMonth, fileId)
      }

      // Create imported file record
      const importedFile: any = {
        fileName: file.name,
        importedAt: new Date().toISOString(),
        fileType: metadata.fileType,
        processingMonth: metadata.processingMonth || '',
        fileKey: fileId,
        accountNumber: metadata.accountNumber,
        cardNumber: metadata.cardNumber,
        transactionCount: metadata.transactionCount,
      }

      // Save to IndexedDB
      const existingData = await transactionStore.getImportedFiles() || { files: [], lastUpdated: '' }

      // Check for duplicates
      const isDuplicate = existingData.files.some(
        (f: ImportedFile) => f.fileName === importedFile.fileName && f.processingMonth === importedFile.processingMonth
      )

      if (isDuplicate) {
        setYesNoModal({
          isOpen: true,
          question: `הקובץ "${file.name}" כבר קיים. האם להחליף אותו?`,
          onConfirm: async () => {
            // Remove old version
            existingData.files = existingData.files.filter(
              (f: ImportedFile) => !(f.fileName === importedFile.fileName && f.processingMonth === importedFile.processingMonth)
            )

            existingData.files.push(importedFile)
            existingData.lastUpdated = new Date().toISOString()
            await transactionStore.saveImportedFiles(existingData)

            // Reload from DB to include generated IDs
            const refreshed = await transactionStore.getImportedFiles()
            if (refreshed) {
              setFiles(refreshed.files)
            }
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
      await transactionStore.saveImportedFiles(existingData)

      // Reload from DB to include generated IDs
      const refreshed = await transactionStore.getImportedFiles()
      if (refreshed) {
        setFiles(refreshed.files)
      }
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

  // Filter files by selected month (credit uses chargingDate month; processingMonth is already set from billing/charging)
  const filteredFiles = selectedMonth
    ? files.filter((f) => f.processingMonth === selectedMonth)
    : files

  // Get actual transaction count from storage
  const [transactionCounts, setTransactionCounts] = useState<Record<string, number>>({})

  // Load transaction counts for all files
  useEffect(() => {
    const loadCounts = async () => {
      const counts: Record<string, number> = {}

      for (const file of files) {
        const transactions = await transactionStore.getData(
          file.fileType,
          file.processingMonth,
          file.cardNumber
        )
        if (file.id) counts[file.id] = transactions?.length || 0
      }

      setTransactionCounts(counts)
    }

    if (files.length > 0) {
      loadCounts()
    }
  }, [files])

  const getActualTransactionCount = (file: ImportedFile): number => {
    return (file.id && transactionCounts[file.id]) ?? file.transactionCount
  }

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
                  excludeFileNames={files.map((f) => f.fileName)}
                  showDebug={config.developerMode}
                  onDebugInspect={async (preview: FilePreview, file: File) => {
                    try {
                      const metadata = await extractFileMetadata(file)
                      const rows = await readExcelFile(file)
                      const tables = parseXlsTables(rows)
                      let parsed: any = null
                      let transactions: any[] | undefined
                      if (metadata.fileType === 'bank') {
                        parsed = parseBankWithRegistry(rows)
                        transactions = parsed.transactions
                      } else if (metadata.fileType === 'credit-card') {
                        parsed = parseCreditWithRegistry(rows)
                        transactions = parsed.statement?.payments
                      }
                      setDebugModal({
                        isOpen: true,
                        title: preview.fileName,
                        metadata,
                        parsed,
                        tables,
                        transactions,
                      })
                    } catch (err) {
                      console.error('Debug inspect failed:', err)
                      showToast('error', 'שגיאה בקריאת הקובץ לצורכי דיבוג')
                    }
                  }}
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
                {filteredFiles.map((file, index) => (
                  <tr key={file.id || file.fileKey || `${file.fileName}-${index}`}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{file.fileType === 'credit-card' ? '💳' : '📄'}</span>
                        <span>{file.fileName}</span>
                      </div>
                    </td>
                    <td>{formatDateTime(file.importedAt || '')}</td>
                    <td>{file.fileType === 'bank' ? 'בנק' : 'כרטיס אשראי'}</td>
                    <td>{file.processingMonth ? formatMonthDisplay(file.processingMonth) : '—'}</td>
                    <td>{file.accountNumber || file.cardNumber || '—'}</td>
                    <td>{getActualTransactionCount(file)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleOpenFile(file.fileName)}
                          className="file-picker"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                          title="פתח את הקובץ המקורי"
                        >
                          📂 פתח
                        </button>
                        <button
                          onClick={() => handleViewFile(file.id ?? null, file.fileKey)}
                          className="file-picker"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                        >
                          👁️ צפה
                        </button>
                        <button
                          onClick={() => handleDeleteFile(file)}
                          className="upload-another-btn"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                        >
                          🗑️ מחק
                        </button>
                      </div>
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

      {/* View Transactions Modal */}
      {viewModal.isOpen && viewModal.file && (
        <div className="modal-overlay" onClick={() => setViewModal({ isOpen: false, file: null, transactions: [] })}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', width: '1200px' }}
          >
            <div className="modal-header">
              <h2>
                {viewModal.file.fileName} - {viewModal.file.fileType === 'bank' ? 'Bank Transactions' : 'Credit Card Payments'}
              </h2>
              <button
                className="modal-close"
                onClick={() => setViewModal({ isOpen: false, file: null, transactions: [] })}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
              {viewModal.file.fileType === 'bank' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Date</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Description</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Balance</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Card Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModal.transactions.map((t: any, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.5rem' }}>{t.date}</td>
                        <td style={{ padding: '0.5rem' }}>{t.description}</td>
                        <td
                          style={{
                            padding: '0.5rem',
                            color: t.amount > 0 ? '#10b981' : '#ef4444',
                            fontWeight: 500,
                          }}
                        >
                          {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(t.amount)}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(t.balance)}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          {t.isCreditCardCharge ? '✓' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Transaction Date</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Merchant</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Installment</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Charging Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModal.transactions.map((t: any, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.5rem' }}>{t.date}</td>
                        <td style={{ padding: '0.5rem' }}>{t.merchant || t.description}</td>
                        <td style={{ padding: '0.5rem', color: '#ef4444', fontWeight: 500 }}>
                          {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Math.abs(t.amount))}
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.875rem' }}>
                          {t.totalSteps && t.totalSteps > 1 ? (
                            <div>
                              <div style={{ fontWeight: 500 }}>
                                {t.currentStep}/{t.totalSteps}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                Total: {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Math.abs(t.totalAmount || t.amount))}
                              </div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          {t.chargingDate || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                <strong>Total Transactions:</strong> {viewModal.transactions.length}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug modal */}
      {debugModal.isOpen && (
        <div className="modal-overlay" onClick={() => setDebugModal({ isOpen: false, title: '' })}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', width: '1200px' }}
          >
            <div className="modal-header">
              <h2>Debug: {debugModal.title}</h2>
              <button className="modal-close" onClick={() => setDebugModal({ isOpen: false, title: '' })}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto', display: 'grid', gap: '1rem' }}>
              <div>
                <h3>זיהוי קובץ</h3>
                <pre style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
                  {JSON.stringify(debugModal.metadata, null, 2)}
                </pre>
              </div>
              <div>
                <h3>פלט פרסר</h3>
                <pre style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
                  {JSON.stringify(debugModal.parsed, null, 2)}
                </pre>
              </div>
              {Array.isArray(debugModal.transactions) && debugModal.transactions.length > 0 && (
                <div>
                  <h3>מה ייכנס למאגר</h3>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>תאריך</th>
                          <th>עסק</th>
                          <th>סכום</th>
                          <th>תשלומים</th>
                        </tr>
                      </thead>
                      <tbody>
                        {debugModal.transactions.map((t, idx) => (
                          <tr key={idx}>
                            <td>{t.transactionDate || t.date || '—'}</td>
                            <td>{t.merchant || t.business || t.description || '—'}</td>
                            <td style={{ color: (t.amount || 0) > 0 ? '#10b981' : '#ef4444', fontWeight: 500 }}>
                              {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Math.abs(t.amount || 0))}
                            </td>
                            <td>{`${t.currentStep || 1}/${t.totalSteps || 1}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div>
                <h3>XLS parse (tables)</h3>
                <pre style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '0.5rem', overflowX: 'auto' }}>
                  {JSON.stringify(debugModal.tables, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
