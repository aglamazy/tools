'use client'

/**
 * Generic list panel for the Stores page — used for both the standing list
 * and the current-week list. Acts as a drop zone for drags coming from the
 * product-history panel.
 */

import type { GroceryItem, GroceryItemMap } from '@/app/services/grocery/groceryTypes'
import { itemKey } from '@/app/services/grocery/groceryTypes'

export interface ItemListPanelProps {
  items: GroceryItemMap
  /**
   * Optional per-item `validTo` (keyed the same as `items`). When present and
   * in the future, the row renders a small "עד DD/MM" badge. The presence of
   * this map is how the pending-list panel shows which entries are standing
   * instructions (survive across orders) vs. single-shot.
   */
  validTo?: Record<string, string | undefined>
  emptyText: string
  dropAccentColor: string
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onRemove: (name: string) => void
  /** Optional extras shown below the list, e.g. "items to remove" in pending */
  footer?: React.ReactNode
}

export default function ItemListPanel(props: ItemListPanelProps) {
  const entries = Object.entries(props.items)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        props.onDragOver(e)
      }}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      style={{
        minHeight: '180px',
        border: `2px dashed ${props.isDragOver ? props.dropAccentColor : '#e5e7eb'}`,
        borderRadius: '0.5rem',
        padding: '0.5rem',
        background: props.isDragOver ? `${props.dropAccentColor}14` : '#fafafa',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      }}
    >
      {entries.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: '0.85rem',
            fontStyle: 'italic',
            padding: '1rem',
          }}
        >
          {props.isDragOver ? 'שחרר כאן' : props.emptyText}
        </div>
      ) : (
        entries.map(([key, item]) => (
          <Row
            key={itemKey(item) || key}
            item={item}
            validTo={props.validTo?.[key]}
            onRemove={props.onRemove}
          />
        ))
      )}

      {props.footer}
    </div>
  )
}

function Row({
  item,
  validTo,
  onRemove,
}: {
  item: GroceryItem
  validTo?: string
  onRemove: (name: string) => void
}) {
  const validToLabel = formatValidToShort(validTo)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.4rem 0.6rem',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '0.375rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', minWidth: 0 }}>
        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.name}</span>
        {item.qty > 1 && (
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            x{item.qty}
            {item.unit ? ` ${item.unit}` : ''}
          </span>
        )}
        {validToLabel && (
          <span
            title={`תוקף: ${validTo}`}
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              padding: '0.1rem 0.4rem',
              background: '#eef2ff',
              color: '#4338ca',
              border: '1px solid #c7d2fe',
              borderRadius: '0.75rem',
              whiteSpace: 'nowrap',
            }}
          >
            עד {validToLabel}
          </span>
        )}
      </div>
      <button
        onClick={() => onRemove(item.name)}
        title="הסר"
        style={{
          background: 'none',
          border: 'none',
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: '1rem',
          lineHeight: 1,
          padding: '0 0.25rem',
        }}
      >
        ×
      </button>
    </div>
  )
}

function formatValidToShort(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // Don't show expired badges — they shouldn't normally be in the list, but
  // if they linger (e.g. before a sweep) we hide the badge to avoid confusion.
  if (d.getTime() <= Date.now()) return null
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}
