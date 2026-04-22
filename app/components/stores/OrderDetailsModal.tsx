'use client'

/**
 * Order details modal for the Stores page.
 *
 * Shows the active order's delivery window, total, and full item list for a
 * single store, and lets the user cancel the order with an inline confirmation
 * step (no native confirm() — banned by CLAUDE.md).
 */

import { useState } from 'react'
import Modal from '@/app/components/Modal'
import type { StoreOrder } from '@/app/services/grocery/storeTypes'

type Props = {
  order: StoreOrder
  storeLabel: string
  onCancel: () => Promise<void>
  onClose: () => void
}

export default function OrderDetailsModal({ order, storeLabel, onCancel, onClose }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [inFlight, setInFlight] = useState(false)

  const delivery = order.delivery || { date: '', time: '' }
  const windowText = [delivery.date, delivery.time, delivery.endTime].filter(Boolean).join(' ')

  async function handleConfirmCancel() {
    if (inFlight) return
    setInFlight(true)
    try {
      await onCancel()
      // Parent is responsible for closing on success; keep button disabled meanwhile.
    } finally {
      setInFlight(false)
      setConfirming(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={inFlight ? () => {} : onClose} maxWidth="560px">
      <div dir="rtl" style={{ padding: '0.5rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>
          פרטי הזמנה
        </h3>
        <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {storeLabel}
        </div>

        {/* Meta grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '0.4rem 0.75rem',
            fontSize: '0.9rem',
            marginBottom: '1rem',
          }}
        >
          <div style={labelStyle}>מספר הזמנה</div>
          <div style={valueStyle}>#{order.orderId}</div>

          <div style={labelStyle}>סטטוס</div>
          <div style={valueStyle}>{order.status || '—'}</div>

          <div style={labelStyle}>חלון משלוח</div>
          <div style={valueStyle}>{windowText || '—'}</div>

          <div style={labelStyle}>סה&quot;כ</div>
          <div style={valueStyle}>{order.total || '—'}</div>

          <div style={labelStyle}>מספר פריטים</div>
          <div style={valueStyle}>{order.itemsCount}</div>
        </div>

        {/* Items list */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            maxHeight: '260px',
            overflowY: 'auto',
            marginBottom: '1rem',
          }}
        >
          {order.items.length === 0 ? (
            <div style={{ padding: '0.75rem', color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem' }}>
              אין פרטי פריטים
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', color: '#6b7280' }}>
                  <th style={thStyle}>פריט</th>
                  <th style={{ ...thStyle, width: '4rem', textAlign: 'center' }}>כמות</th>
                  <th style={{ ...thStyle, width: '6rem', textAlign: 'left' }}>מחיר</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, idx) => (
                  <tr key={`${it.name}-${idx}`} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>{it.name}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{it.qty}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{it.price || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Actions */}
        {!confirming ? (
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={inFlight}
              style={secondaryBtn}
            >
              סגירה
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={inFlight || !order.cancelable}
              title={order.cancelable ? '' : 'הזמנה זו אינה ניתנת לביטול'}
              style={{
                ...destructiveBtn,
                opacity: order.cancelable ? 1 : 0.5,
                cursor: order.cancelable ? 'pointer' : 'not-allowed',
              }}
            >
              ביטול הזמנה
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: '0.75rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <div style={{ color: '#991b1b', fontWeight: 600, fontSize: '0.95rem' }}>
              אישור ביטול?
            </div>
            <div style={{ color: '#7f1d1d', fontSize: '0.85rem' }}>
              ביטול הזמנה #{order.orderId} אצל {storeLabel}. פעולה זו אינה ניתנת לשחזור.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={inFlight}
                style={secondaryBtn}
              >
                חזרה
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={inFlight}
                style={destructiveBtn}
              >
                {inFlight ? 'מבטל…' : 'אישור ביטול'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

const labelStyle: React.CSSProperties = {
  color: '#6b7280',
  whiteSpace: 'nowrap',
}

const valueStyle: React.CSSProperties = {
  fontWeight: 500,
  color: '#111827',
}

const thStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: '0.8rem',
  borderBottom: '1px solid #e5e7eb',
}

const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  color: '#374151',
}

const secondaryBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
}

const destructiveBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: '1px solid #b91c1c',
  background: '#dc2626',
  color: '#fff',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
}
