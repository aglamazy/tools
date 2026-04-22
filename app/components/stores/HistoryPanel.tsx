'use client'

/**
 * Product history for a store. Items are draggable (HTML5 DnD) onto the
 * standing list or the current-week list.
 *
 * "History" here is aggregated server-side from: current standing list +
 * current pending add items + items in active orders (best-effort). We do
 * not add a new DB table — this matches the existing data model.
 */

import { useMemo, useState } from 'react'
import type { HistoryEntry } from '@/app/services/groceryPageService'

const SOURCE_LABEL: Record<HistoryEntry['source'], { label: string; color: string }> = {
  standing: { label: 'קבוע', color: '#2563eb' },
  pending: { label: 'שבוע זה', color: '#d97706' },
  order: { label: 'הזמנה פעילה', color: '#047857' },
}

export interface HistoryPanelProps {
  history: HistoryEntry[]
  historyError?: string
  onDragStart: (item: HistoryEntry) => void
  onDragEnd: () => void
}

export default function HistoryPanel({ history, historyError, onDragStart, onDragEnd }: HistoryPanelProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return history
    return history.filter((h) => h.name.toLowerCase().includes(q))
  }, [history, query])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 0 }}>
      <input
        type="text"
        placeholder="חיפוש במוצרים..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          padding: '0.5rem 0.6rem',
          borderRadius: '0.375rem',
          border: '1px solid #d1d5db',
          fontSize: '0.875rem',
        }}
      />

      {historyError && (
        <div
          style={{
            fontSize: '0.75rem',
            color: '#b45309',
            background: '#fef3c7',
            padding: '0.4rem 0.5rem',
            borderRadius: '0.375rem',
          }}
        >
          לא ניתן היה לטעון הזמנות פעילות: {historyError}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          maxHeight: '320px',
          overflowY: 'auto',
          padding: '0.25rem',
          border: '1px solid #e5e7eb',
          borderRadius: '0.375rem',
          background: '#fff',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '0.85rem',
              fontStyle: 'italic',
            }}
          >
            {history.length === 0 ? 'אין היסטוריית מוצרים להצגה' : 'אין תוצאות'}
          </div>
        ) : (
          filtered.map((entry) => {
            const badge = SOURCE_LABEL[entry.source]
            return (
              <div
                key={`${entry.source}-${entry.catalogId || entry.name}`}
                draggable
                onDragStart={(e) => {
                  // Serialize for drop handlers that read from dataTransfer (not strictly needed
                  // because the parent also tracks draggedItem in state, but harmless).
                  e.dataTransfer.setData('application/x-grocery-item', JSON.stringify(entry))
                  e.dataTransfer.effectAllowed = 'copy'
                  onDragStart(entry)
                }}
                onDragEnd={onDragEnd}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.4rem 0.5rem',
                  borderRadius: '0.25rem',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  cursor: 'grab',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                  <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>⋮⋮</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{entry.name}</span>
                  {entry.unit && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{entry.unit}</span>}
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: '#fff',
                    background: badge.color,
                    padding: '0.1rem 0.4rem',
                    borderRadius: '0.75rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {badge.label}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
