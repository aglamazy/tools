'use client'

import React from 'react'
import type { ExpenseDocument, Transaction } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import type { ExpenseTableRow, MatchStatus } from './expenseTabTypes'

type EditValues = { description: string; category: string; amount?: string }

type Props = {
  visibleRows: ExpenseTableRow[]
  categories: Category[]
  matchStatus: Record<number, MatchStatus>
  matchedDocs: Record<number, ExpenseDocument[]>
  sortKey: 'date' | 'party' | 'amount'
  sortDir: 'asc' | 'desc'
  onSort: (key: 'date' | 'party' | 'amount') => void
  editingTxId: number | null
  editValues: EditValues
  setEditValues: (updater: (v: EditValues) => EditValues) => void
  editingIsCash: boolean
  startEdit: (t: Transaction) => void
  saveEdit: () => void
  cancelEdit: () => void
  handleMatchReceipt: (t: Transaction) => void
  handleUploadReceipt: (t: Transaction, files: FileList) => void
  handleUnlink: (txId: number) => void
  handleDeleteCash: (t: Transaction) => void
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600, padding: 0, color: '#0f172a' }}
    >
      {label} {active ? (dir === 'asc' ? '▲' : '▼') : ''}
    </button>
  )
}

export default function ExpenseRowsTable({
  visibleRows, categories, matchStatus, matchedDocs, sortKey, sortDir, onSort,
  editingTxId, editValues, setEditValues, editingIsCash,
  startEdit, saveEdit, cancelEdit, handleMatchReceipt, handleUploadReceipt, handleUnlink, handleDeleteCash,
}: Props) {
  if (visibleRows.length === 0) {
    return <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>אין הוצאות בתקופה זו</p>
  }

  const searching = Object.values(matchStatus).includes('searching')

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
              <SortHeader label="תאריך" active={sortKey === 'date'} dir={sortDir} onClick={() => onSort('date')} />
            </th>
            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>תיאור</th>
            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>נושא</th>
            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
              <SortHeader label="שולם ע״י" active={sortKey === 'party'} dir={sortDir} onClick={() => onSort('party')} />
            </th>
            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>
              <SortHeader label="סכום" active={sortKey === 'amount'} dir={sortDir} onClick={() => onSort('amount')} />
            </th>
            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>מע״מ</th>
            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '80px' }}>קבלה</th>
            <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '60px' }}></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            if (row.kind === 'transaction') {
              const t = row.transaction
              const txId = row.id
              const status = matchStatus[txId] || 'idle'
              const docs = matchedDocs[txId]
              const firstDoc = docs?.[0]
              const vatTotal = docs?.reduce((s, d) => s + (d.vatAmount || 0), 0)
              const isEditing = editingTxId === txId
              return (
                <tr key={`tx-${txId}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{t.date}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValues.description}
                        onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))}
                        style={{ padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '100%', direction: 'rtl', boxSizing: 'border-box' }}
                        autoFocus
                      />
                    ) : (
                      <>
                        {firstDoc?.description || firstDoc?.vendor || t.merchant || t.description}
                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8' }}>
                          {t.description}
                        </span>
                      </>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>
                    {isEditing ? (
                      <select
                        value={editValues.category}
                        onChange={e => setEditValues(v => ({ ...v, category: e.target.value }))}
                        style={{ padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', direction: 'rtl' }}
                      >
                        <option value="">—</option>
                        {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    ) : t.category}
                  </td>
                  <td style={{ padding: '0.6rem 0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                    {row.partyLabel}
                  </td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 500, color: '#dc2626' }}>
                    {isEditing && editingIsCash ? (
                      <input
                        type="number"
                        value={editValues.amount || ''}
                        onChange={e => setEditValues(v => ({ ...v, amount: e.target.value }))}
                        style={{ padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', width: '90px', textAlign: 'left' }}
                      />
                    ) : (
                      <>₪{row.amount.toLocaleString()}</>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#64748b', fontSize: '0.85rem' }}>
                    {vatTotal ? `₪${vatTotal.toLocaleString()}` : ''}
                  </td>
                  <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                    {status === 'matched' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                        {docs?.map((doc, i) => (
                          doc.driveWebViewLink ? (
                            <a key={i} href={doc.driveWebViewLink} target="_blank" rel="noopener noreferrer" title={doc.vendor || doc.fileName || 'פתח קבלה'} style={{ color: '#10b981', textDecoration: 'none', fontSize: '0.9rem' }}>📄</a>
                          ) : (
                            <span key={i} title={doc.vendor || 'נמצאה קבלה'} style={{ color: '#10b981' }}>✓</span>
                          )
                        ))}
                        <button
                          onClick={() => handleUnlink(txId)}
                          title="הסר קישור"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.7rem', padding: 0 }}
                        >✕</button>
                      </div>
                    ) : status === 'searching' ? (
                      <span style={{ color: '#64748b' }}>...</span>
                    ) : status === 'no-match' ? (
                      <button
                        onClick={() => handleMatchReceipt(t)}
                        disabled={searching}
                        title="לא נמצאה קבלה — לחץ לחיפוש נוסף"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', fontSize: '0.85rem', padding: '0.1rem 0.3rem' }}
                      >לא נמצא</button>
                    ) : status === 'error' ? (
                      <button
                        onClick={() => handleMatchReceipt(t)}
                        disabled={searching}
                        title="שגיאה — לחץ לניסיון נוסף"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.85rem', padding: '0.1rem 0.3rem' }}
                      >שגיאה</button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
                        <button
                          onClick={() => handleMatchReceipt(t)}
                          disabled={searching}
                          title="חפש קבלה ב-Gmail"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.1rem 0.3rem', opacity: searching ? 0.4 : 1 }}
                        >
                          🔍
                        </button>
                        <label
                          title="העלה קבלה"
                          style={{ cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem 0.3rem', opacity: searching ? 0.4 : 1 }}
                        >
                          📎
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const files = e.target.files
                              if (files && files.length > 0) handleUploadReceipt(t, files)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.25rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                        <button onClick={saveEdit} title="שמור" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#10b981', padding: '0.1rem 0.25rem' }}>✓</button>
                        <button onClick={cancelEdit} title="בטל" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', padding: '0.1rem 0.25rem' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                        <button onClick={() => startEdit(t)} title="ערוך" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.1rem 0.25rem', color: '#64748b' }}>✎</button>
                        {t.type === 'cash' && (
                          <button onClick={() => handleDeleteCash(t)} title="מחק" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '0.1rem 0.25rem', color: '#dc2626' }}>✕</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            }

            const d = row.doc
            return (
              <tr key={`pp-${d.id}`} style={{ borderBottom: '1px solid #f1f5f9', background: '#fffbeb' }}>
                <td style={{ padding: '0.6rem 0.5rem' }}>{d.date || '—'}</td>
                <td style={{ padding: '0.6rem 0.5rem' }}>
                  {d.vendor || d.fileName}
                  <span style={{ display: 'block', fontSize: '0.75rem', color: '#92400e' }}>
                    🧾 חשבונית ששולמה ע״י שותף (אין רישום בנק)
                  </span>
                </td>
                <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{d.category || '—'}</td>
                <td style={{ padding: '0.6rem 0.5rem' }}>{row.partyLabel}</td>
                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>
                  ₪{row.amount.toLocaleString()}
                </td>
                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#64748b' }}>
                  {d.vatAmount != null ? `₪${d.vatAmount.toLocaleString()}` : '—'}
                </td>
                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                  {d.driveWebViewLink ? (
                    <a href={d.driveWebViewLink} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9' }}>
                      קובץ
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
