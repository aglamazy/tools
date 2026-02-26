'use client'

import { useState } from 'react'
import { findDuplicates, removeAllDuplicates, removeDuplicatesForTable, type DedupReport, type DuplicateGroup } from '@/app/services/dedupService'
import { exportAllStores } from '@/app/services/backupService'
import Modal from '../../Modal'
import YesNoModal from '../../YesNoModal'

export default function DedupSection() {
  const [report, setReport] = useState<DedupReport | null>(null)
  const [scanning, setScanning] = useState(false)
  const [backedUp, setBackedUp] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [confirmTable, setConfirmTable] = useState<{ table: string; label: string; ids: number[] } | null>(null)
  const [detailGroup, setDetailGroup] = useState<DuplicateGroup | null>(null)

  const handleScan = async () => {
    setScanning(true)
    try {
      const result = await findDuplicates()
      setReport(result)
    } catch (err) {
      console.error('Error scanning for duplicates:', err)
    } finally {
      setScanning(false)
    }
  }

  const handleBackupFirst = async () => {
    try {
      const backup = await exportAllStores()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-pre-dedup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      setBackedUp(true)
    } catch (err) {
      console.error('Error creating backup:', err)
    }
  }

  const handleRemoveAll = async () => {
    if (!report) return
    setConfirmAll(false)
    const removed = await removeAllDuplicates(report)
    console.log(`Removed ${removed} duplicates`)
    const result = await findDuplicates()
    setReport(result)
  }

  const handleRemoveTable = async (tableName: string, removeIds: number[]) => {
    setConfirmTable(null)
    await removeDuplicatesForTable(tableName, removeIds, report ?? undefined)
    const result = await findDuplicates()
    setReport(result)
  }

  // Group report by table for summary view
  const byTable = new Map<string, { label: string; groups: DuplicateGroup[]; totalRemove: number }>()
  if (report) {
    for (const g of report.groups) {
      const existing = byTable.get(g.table)
      if (existing) {
        existing.groups.push(g)
        existing.totalRemove += g.removeIds.length
      } else {
        byTable.set(g.table, { label: g.tableLabel, groups: [g], totalRemove: g.removeIds.length })
      }
    }
  }

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '-'
    if (typeof val === 'boolean') return val ? 'כן' : 'לא'
    if (typeof val === 'number') return val.toLocaleString('he-IL')
    if (typeof val === 'string' && val.length > 60) return val.slice(0, 60) + '...'
    return String(val)
  }

  return (
    <>
      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: report ? '1rem' : 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>ניקוי כפילויות</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              סריקת כל הטבלאות ומחיקת שורות כפולות. נשמרת השורה הראשונה מכל קבוצה.
            </p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="file-picker"
            style={{ background: '#8b5cf6', color: 'white', flexShrink: 0 }}
          >
            {scanning ? 'סורק...' : 'סרוק כפילויות'}
          </button>
        </div>

        {report && report.totalDuplicates === 0 && (
          <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '0.5rem', color: '#166534', textAlign: 'center' }}>
            לא נמצאו כפילויות - הנתונים נקיים
          </div>
        )}

        {report && report.totalDuplicates > 0 && (
          <div>
            <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '0.5rem', color: '#991b1b', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                נמצאו <strong>{report.totalDuplicates}</strong> שורות כפולות ב-{byTable.size} טבלאות
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {!backedUp ? (
                  <button
                    onClick={handleBackupFirst}
                    className="file-picker"
                    style={{ background: '#f59e0b', color: 'white', fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                  >
                    גבה לפני מחיקה
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmAll(true)}
                    className="file-picker"
                    style={{ background: '#dc2626', color: 'white', fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                  >
                    מחק הכל ({report.totalDuplicates})
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Array.from(byTable.entries()).map(([tableName, { label, groups, totalRemove }]) => (
                <div key={tableName} style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{label}</strong>
                      <span style={{ color: '#64748b', marginRight: '0.5rem', fontSize: '0.85rem' }}>
                        {groups.length} קבוצות, {totalRemove} כפולות למחיקה
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => setDetailGroup(groups[0])}
                        className="file-picker"
                        style={{ background: '#e2e8f0', color: '#334155', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                      >
                        פרטים
                      </button>
                      {backedUp && (
                        <button
                          onClick={() => {
                            const allIds = groups.flatMap(g => g.removeIds)
                            setConfirmTable({ table: tableName, label, ids: allIds })
                          }}
                          className="file-picker"
                          style={{ background: '#ef4444', color: 'white', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                        >
                          מחק ({totalRemove})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Details modal - shows sample rows for a table */}
      <Modal isOpen={!!detailGroup} onClose={() => setDetailGroup(null)} maxWidth="700px">
        {detailGroup && (() => {
          const tableGroups = byTable.get(detailGroup.table)
          if (!tableGroups) return null
          return (
            <div style={{ padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem' }}>כפילויות: {detailGroup.tableLabel}</h3>
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {tableGroups.groups.map((group, i) => {
                  const fields = Object.entries(group.sample).filter(
                    ([k]) => !['importedAt', 'createdAt', 'updatedAt'].includes(k)
                  )
                  return (
                    <div key={i} style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem' }}>
                        {group.ids.length} שורות (נשמר #{group.keepId}, נמחקים: {group.removeIds.join(', ')})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.75rem', fontSize: '0.85rem' }}>
                        {fields.map(([key, val]) => (
                          <div key={key} style={{ display: 'contents' }}>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>{key}</span>
                            <span>{formatValue(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Confirm delete all */}
      <YesNoModal
        isOpen={confirmAll}
        question={`למחוק ${report?.totalDuplicates ?? 0} שורות כפולות מכל הטבלאות?`}
        onYes={handleRemoveAll}
        onNo={() => setConfirmAll(false)}
      />

      {/* Confirm delete per table */}
      <YesNoModal
        isOpen={!!confirmTable}
        question={`למחוק ${confirmTable?.ids.length ?? 0} כפולות מטבלת ${confirmTable?.label ?? ''}?`}
        onYes={() => confirmTable && handleRemoveTable(confirmTable.table, confirmTable.ids)}
        onNo={() => setConfirmTable(null)}
      />
    </>
  )
}
