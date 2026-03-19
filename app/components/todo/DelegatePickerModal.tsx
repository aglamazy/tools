'use client'

import type { BotSummary } from '@/app/services/botService'

type DelegateTarget = {
  type: 'partner'
  uid: string
  label: string
} | {
  type: 'bot'
  bot: BotSummary
}

type Props = {
  partnerUid: string | null
  partnerEmail: string | null
  bots: BotSummary[]
  onSelect: (target: DelegateTarget) => void
  onClose: () => void
}

export type { DelegateTarget }

export default function DelegatePickerModal({ partnerUid, partnerEmail, bots, onSelect, onClose }: Props) {
  const hasTargets = partnerUid || bots.length > 0

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        dir="rtl"
        style={{
          background: '#fff',
          borderRadius: '0.75rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          padding: '1.5rem',
          minWidth: '300px',
          maxWidth: '400px',
        }}
      >
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#1f2937' }}>
          האצל למי?
        </h3>

        {!hasTargets && (
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            אין שותפים או בוטים מוגדרים. הוסף בוט בהגדרות.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Partner option */}
          {partnerUid && (
            <button
              onClick={() => onSelect({ type: 'partner', uid: partnerUid, label: partnerEmail || 'שותף/ה' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.95rem',
                textAlign: 'right',
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>👥</span>
              <div>
                <div style={{ fontWeight: 500, color: '#166534' }}>{partnerEmail || 'שותף/ה'}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>חבר/ת משק בית</div>
              </div>
            </button>
          )}

          {/* Bot options */}
          {bots.map(bot => (
            <button
              key={bot.id}
              onClick={() => onSelect({ type: 'bot', bot })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.95rem',
                textAlign: 'right',
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>🤖</span>
              <div>
                <div style={{ fontWeight: 500, color: '#1e40af' }}>{bot.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>@{bot.handle}</div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.5rem',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            color: '#6b7280',
          }}
        >
          ביטול
        </button>
      </div>
    </div>
  )
}
