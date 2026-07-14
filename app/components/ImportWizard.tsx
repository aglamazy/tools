'use client'

import { useState, useEffect, useCallback } from 'react'
import { db, type ImportedFile } from '@/app/db/financeDB'
import { formatMonthDisplay } from '@/app/utils/formatters'
import { requestDirectoryPermission } from '@/app/utils/directoryStorage'
import { scanDirectoryRecursive } from '@/app/utils/folderScanner'
import { analyzeImportStatus, type WizardFileEntry, type FileStatus } from '@/app/utils/importWizardAnalyzer'
import { findBankGaps, findCreditGaps, type GapRange } from '@/app/utils/importGapAnalyzer'
import { transactionStore } from '@/app/stores/transactionStore'

type ImportWizardProps = {
  isOpen: boolean
  onClose: () => void
  dirHandle: FileSystemDirectoryHandle | null
  onFileSelect: (file: File) => void | Promise<void>
}

export default function ImportWizard({ isOpen, onClose, dirHandle, onFileSelect }: ImportWizardProps) {
  const [entries, setEntries] = useState<WizardFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gapsByKey, setGapsByKey] = useState<Map<string, GapRange[]>>(new Map())

  const entryKey = (e: WizardFileEntry) =>
    `${e.fileType}-${e.month}-${e.accountNumber || e.cardNumber || ''}`

  const scan = useCallback(async () => {
    if (!dirHandle) return
    setLoading(true)
    setError('')

    try {
      const hasPermission = await requestDirectoryPermission(dirHandle, 'read')
      if (!hasPermission) {
        setError('אין הרשאה לתיקייה.')
        setLoading(false)
        return
      }

      const folderFiles = await scanDirectoryRecursive(dirHandle)
      const data = await transactionStore.getImportedFiles()
      const importedFiles: ImportedFile[] = data?.files || []

      setEntries(analyzeImportStatus(importedFiles, folderFiles))
    } catch (err) {
      console.error('Wizard scan error:', err)
      setError('אירעה שגיאה בסריקת התיקייה.')
    } finally {
      setLoading(false)
    }
  }, [dirHandle])

  const scanGaps = useCallback(async () => {
    // Pure DB check — runs independently of the folder scan (no dirHandle needed).
    const allTxns = await db.transactions.toArray()
    const bankAccounts = new Set(
      allTxns.filter((t) => t.type === 'bank' && t.accountNumber).map((t) => t.accountNumber!)
    )
    const creditCards = new Set(
      allTxns.filter((t) => t.type === 'credit' && t.cardNumber).map((t) => t.cardNumber!)
    )

    const map = new Map<string, GapRange[]>()
    for (const account of bankAccounts) {
      const gaps = findBankGaps(allTxns, account)
      if (gaps.length > 0) map.set(`bank|${account}`, gaps)
    }
    for (const card of creditCards) {
      const gaps = findCreditGaps(allTxns, card)
      if (gaps.length > 0) map.set(`credit-card|${card}`, gaps)
    }
    setGapsByKey(map)
  }, [])

  useEffect(() => {
    if (isOpen) {
      scan()
      void scanGaps()
    }
  }, [isOpen, scan, scanGaps])

  const handleImport = async (entry: WizardFileEntry) => {
    if (!entry.folderFile) return
    const file = await entry.folderFile.fileHandle.getFile()
    onClose()
    onFileSelect(file)
  }

  const handleImportAll = async () => {
    const importable = entries.filter(
      (e) => (e.status === 'ready' || (e.status === 'stale' && e.folderFile)) && e.folderFile
    )
    const files: File[] = []
    for (const entry of importable) {
      files.push(await entry.folderFile!.fileHandle.getFile())
    }
    onClose()
    for (const file of files) {
      await onFileSelect(file)
    }
  }

  const handleOpenFile = async (entry: WizardFileEntry) => {
    const filePreview = entry.folderFile
    if (!filePreview) return
    try {
      const file = await filePreview.fileHandle.getFile()
      const url = URL.createObjectURL(file)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      console.error('Error opening file:', err)
    }
  }

  if (!isOpen) return null

  const counts: Record<FileStatus, number> = { fresh: 0, stale: 0, ready: 0, missing: 0 }
  for (const e of entries) counts[e.status]++
  const importableCount = counts.ready + entries.filter((e) => e.status === 'stale' && e.folderFile).length

  // Group by month descending, skip months where everything is fresh
  const actionableEntries = entries.filter((e) => e.status !== 'fresh')
  const byMonth = new Map<string, WizardFileEntry[]>()
  for (const e of actionableEntries) {
    const list = byMonth.get(e.month) || []
    list.push(e)
    byMonth.set(e.month, list)
  }
  const sortedMonths = [...byMonth.keys()].sort((a, b) => {
    const [am, ay] = a.split('/').map(Number)
    const [bm, by] = b.split('/').map(Number)
    return (by * 12 + bm) - (ay * 12 + am)
  })

  const statusColor: Record<FileStatus, string> = {
    fresh: '#10b981',
    stale: '#f59e0b',
    ready: '#3b82f6',
    missing: '#9ca3af',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', width: '900px' }}>
        <div className="modal-header">
          <h2>אשף ייבוא</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={scan}
              disabled={loading}
              style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '1rem' }}
              title="רענן"
            >
              🔄
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {error && <div className="banner error" style={{ marginBottom: '1rem' }}>{error}</div>}
          {loading && <div className="banner" style={{ marginBottom: '1rem' }}>סורק קבצים...</div>}

          {gapsByKey.size > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {[...gapsByKey.entries()].map(([key, gaps]) => {
                const [kind, id] = key.split('|')
                return (
                  <div key={key} style={{ padding: '0.6rem 0.9rem', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '0.5rem' }}>
                    <strong style={{ fontSize: '0.875rem' }}>
                      ⚠️ {kind === 'bank' ? '🏦 בנק' : '💳 כרטיס אשראי'} {id} — אין קובץ מיובא בטווח זה:
                    </strong>
                    {gaps.map((g, i) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#9a3412', marginTop: '0.2rem' }}>
                        {g.startDate} – {g.endDate}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && entries.length > 0 && (
            <>
              {/* Summary */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
                <span style={{ color: statusColor.fresh }}>✓ {counts.fresh} תקין</span>
                <span style={{ color: statusColor.stale }}>⚠️ {counts.stale} לא עדכני</span>
                <span style={{ color: statusColor.ready }}>📥 {counts.ready} מוכן לייבוא</span>
                <span style={{ color: statusColor.missing }}>❌ {counts.missing} חסר</span>
                {importableCount > 0 && (
                  <button onClick={handleImportAll} className="file-picker" style={{ marginRight: 'auto', padding: '0.375rem 1rem', fontSize: '0.875rem' }}>
                    📥 ייבא הכל ({importableCount})
                  </button>
                )}
              </div>

              {/* Table grouped by month */}
              {sortedMonths.map((month) => (
                <div key={month} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>
                    {formatMonthDisplay(month)}
                  </h3>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>סוג</th>
                          <th>חשבון/כרטיס</th>
                          <th>קובץ</th>
                          <th>סטטוס</th>
                          <th>פעולה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byMonth.get(month)!.map((entry) => (
                          <tr key={entryKey(entry)}>
                            <td>{entry.fileType === 'bank' ? '🏦 בנק' : '💳 כרטיס אשראי'}</td>
                            <td>{entry.accountNumber || entry.cardNumber || '—'}</td>
                            <td>
                              {entry.folderFile ? (
                                <button
                                  onClick={() => handleOpenFile(entry)}
                                  title={entry.folderFile.fileName}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', textDecoration: 'underline', fontSize: '0.875rem', padding: 0 }}
                                >
                                  {entry.folderFile.fileName}
                                </button>
                              ) : entry.importedFile?.fileName || '—'}
                            </td>
                            <td>
                              <span style={{ color: statusColor[entry.status], fontWeight: 500 }}>
                                {entry.status === 'fresh' && '✓ תקין'}
                                {entry.status === 'stale' && '⚠️ לא עדכני'}
                                {entry.status === 'ready' && '📥 מוכן לייבוא'}
                                {entry.status === 'missing' && '❌ חסר'}
                              </span>
                              {entry.staleReason && (
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                                  {entry.staleReason}
                                </div>
                              )}
                            </td>
                            <td>
                              {(entry.status === 'ready' && entry.folderFile) && (
                                <button onClick={() => handleImport(entry)} className="file-picker" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>
                                  ייבא
                                </button>
                              )}
                              {(entry.status === 'stale' && entry.folderFile) && (
                                <button onClick={() => handleImport(entry)} className="file-picker" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>
                                  ייבא מחדש
                                </button>
                              )}
                              {(entry.status === 'stale' && !entry.folderFile) && (
                                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>יש להוריד מהבנק</span>
                              )}
                              {entry.status === 'missing' && (
                                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>יש להוריד מהבנק</span>
                              )}
                              {entry.status === 'fresh' && '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && entries.length > 0 && actionableEntries.length === 0 && !error && (
            <div className="banner" style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46' }}>
              ✓ כל הקבצים מעודכנים!
            </div>
          )}

          {!loading && entries.length === 0 && !error && (
            <div className="banner">
              {dirHandle ? 'לא נמצאו קבצים או חשבונות לניתוח.' : 'יש לבחור תיקייה תחילה במסך הייבוא.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
