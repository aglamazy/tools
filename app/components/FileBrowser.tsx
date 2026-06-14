'use client'

import { useState, useEffect, useMemo } from 'react'
import type { FilePreview } from '@/app/types/file-preview'
import { FileType } from '@/app/types/file-type'
import { requestDirectoryPermission } from '@/app/utils/directoryStorage'
import { scanDirectoryForFiles } from '@/app/utils/folderScanner'
import { transactionStore } from '@/app/stores/transactionStore'
import type { ImportedFile } from '@/app/db/financeDB'

type FileBrowserProps = {
  onFileSelect: (file: File) => void
  isOpen?: boolean
  savedDirHandle: FileSystemDirectoryHandle | null
  onDirHandleChange: (handle: FileSystemDirectoryHandle | null) => void
  excludeFileNames?: string[]
  showDebug?: boolean
  onDebugInspect?: (preview: FilePreview, file: File) => void
}

type SortKey = 'fileName' | 'month' | 'account' | 'count' | 'modified'
type SortDir = 'asc' | 'desc'

const importedKey = (fileType: FileType | 'bank' | 'credit-card', month: string | null, account: string | null | undefined, card: string | null | undefined): string => {
  // FileType enum + the importedFiles' raw 'bank' | 'credit-card' both stringify
  // to the same value, so compare on the string form.
  const isCard = String(fileType) === 'credit-card'
  const t = isCard ? 'credit-card' : 'bank'
  return `${t}|${month || ''}|${(isCard ? card : account) || ''}`
}

function SortHeader({ label, col, sortKey, sortDir, onClick }: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onClick: (k: SortKey) => void
}) {
  const active = sortKey === col
  const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th
      onClick={() => onClick(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      title="לחץ למיון"
    >
      {label}{arrow}
    </th>
  )
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
  const [subfolders, setSubfolders] = useState<{ name: string; handle: FileSystemDirectoryHandle }[]>([])
  const [dirStack, setDirStack] = useState<{ name: string; handle: FileSystemDirectoryHandle }[]>([])
  const [currentDirHandle, setCurrentDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('modified')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Auto-load files when modal opens using the saved directory from settings
  useEffect(() => {
    const run = async () => {
      if (!isOpen) return
      if (!savedDirHandle) {
        // No folder selected yet - show folder selection UI
        setPreviews([])
        setSubfolders([])
        setDirStack([])
        return
      }

      setError('')
      setDirStack([])
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

  // Pull the imported-files index so we can mark folder files that already
  // landed in the DB. Cheap (single Dexie read); re-run on open so a fresh
  // import done elsewhere reflects without remounting the modal.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    transactionStore.getImportedFiles()
      .then(data => { if (!cancelled) setImportedFiles(data?.files || []) })
      .catch(() => { if (!cancelled) setImportedFiles([]) })
    return () => { cancelled = true }
  }, [isOpen])

  const importedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const f of importedFiles) {
      keys.add(importedKey(f.fileType, f.processingMonth, f.accountNumber, f.cardNumber))
    }
    return keys
  }, [importedFiles])

  const isImported = (p: FilePreview): boolean =>
    importedKeys.has(importedKey(p.fileType, p.processingMonth, p.accountNumber, p.cardNumber))

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      // Sensible default per column: text asc, numeric/date desc.
      setSortDir(key === 'fileName' || key === 'account' ? 'asc' : 'desc')
    }
  }

  const sortedPreviews = useMemo(() => {
    const parseMonthYear = (monthStr: string | null): number => {
      if (!monthStr) return 0
      const [month, year] = monthStr.split('/').map(v => parseInt(v, 10))
      return year * 12 + month
    }
    const sign = sortDir === 'asc' ? 1 : -1
    const arr = [...previews]
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'fileName':
          return sign * a.fileName.localeCompare(b.fileName)
        case 'month':
          return sign * (parseMonthYear(a.processingMonth) - parseMonthYear(b.processingMonth))
        case 'account': {
          const aA = a.accountNumber || a.cardNumber || ''
          const bA = b.accountNumber || b.cardNumber || ''
          return sign * aA.localeCompare(bA)
        }
        case 'count':
          return sign * (a.transactionCount - b.transactionCount)
        case 'modified':
        default:
          return sign * (a.lastModified - b.lastModified)
      }
    })
    return arr
  }, [previews, sortKey, sortDir])

  const loadFilesFromDirectory = async (dirHandle: FileSystemDirectoryHandle) => {
    setLoading(true)
    setError('')
    setPreviews([])
    setSubfolders([])
    setCurrentDirHandle(dirHandle)

    try {
      const { files, subfolders: folders } = await scanDirectoryForFiles(dirHandle)
      setSubfolders(folders)

      const exclude = new Set((excludeFileNames || []).map((n) => n.toLowerCase()))
      const validPreviews = files.filter((p) => !exclude.has(p.fileName.toLowerCase()))
      // Order applied at render via sortedPreviews — load order is irrelevant.
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
        setDirStack([])
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

  const handleEnterSubfolder = async (folder: { name: string; handle: FileSystemDirectoryHandle }) => {
    if (currentDirHandle) {
      setDirStack((prev) => [...prev, { name: currentDirHandle.name, handle: currentDirHandle }])
    }
    await loadFilesFromDirectory(folder.handle)
  }

  const handleGoBack = async () => {
    if (dirStack.length === 0) return
    const parent = dirStack[dirStack.length - 1]
    setDirStack((prev) => prev.slice(0, -1))
    await loadFilesFromDirectory(parent.handle)
  }

  const formatRelativeHe = (ts: number): string => {
    if (!ts) return '—'
    const diff = Date.now() - ts
    if (diff < 0) return 'עכשיו'
    const min = Math.floor(diff / 60_000)
    if (min < 1) return 'עכשיו'
    if (min < 60) return `לפני ${min} דק׳`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `לפני ${hr} שע׳`
    const d = Math.floor(hr / 24)
    if (d === 1) return 'אתמול'
    if (d < 7) return `לפני ${d} ימים`
    const w = Math.floor(d / 7)
    if (w < 5) return `לפני ${w} שב׳`
    const mo = Math.floor(d / 30)
    if (mo < 12) return `לפני ${mo} חוד׳`
    return `לפני ${Math.floor(d / 365)} שנ׳`
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

      {savedDirHandle && !loading && dirStack.length > 0 && (
        <button
          onClick={handleGoBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            marginBottom: '0.5rem',
            background: 'transparent',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            color: '#475569',
          }}
        >
          ↩ חזור ל-{dirStack[dirStack.length - 1].name}
        </button>
      )}

      {savedDirHandle && !loading && subfolders.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          {subfolders.map((folder) => (
            <button
              key={folder.name}
              onClick={() => handleEnterSubfolder(folder)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.625rem 1rem',
                marginBottom: '0.25rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
                textAlign: 'right',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
            >
              <span>📁</span>
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
      )}

      {previews.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <SortHeader label="שם קובץ" col="fileName" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader label="תאריך" col="month" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader label="חשבון" col="account" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader label="מספר עסקה" col="count" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader label="שונה לאחרונה" col="modified" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th>סטטוס</th>
                {showDebug && <th>Dev</th>}
              </tr>
            </thead>
            <tbody>
              {sortedPreviews.map((preview, index) => {
                const imported = isImported(preview)
                return (
                <tr
                  key={index}
                  onClick={() => handleSelectFile(preview)}
                  style={{ cursor: 'pointer', opacity: imported ? 0.65 : 1 }}
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
                  <td title={new Date(preview.lastModified).toLocaleString('he-IL')}>
                    {formatRelativeHe(preview.lastModified)}
                  </td>
                  <td>
                    {imported ? (
                      <span style={{
                        display: 'inline-block',
                        padding: '0.125rem 0.5rem',
                        background: '#dcfce7',
                        color: '#166534',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                      }}>✓ יובא</span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>חדש</span>
                    )}
                  </td>
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
              )})}
            </tbody>
          </table>
        </div>
      )}
      {savedDirHandle && !loading && !error && previews.length === 0 && subfolders.length === 0 && (
        <div className="banner" style={{ marginTop: '1rem' }}>
          לא נמצאו קבצי XLS/XLSX בתיקייה שנבחרה.
        </div>
      )}
    </div>
  )
}
