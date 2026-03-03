'use client'

import React from 'react'
import type { BusinessUI } from '@/app/types/business'

export type { BusinessUI }

type BusinessCardProps = {
  business: BusinessUI
  onEdit: (business: BusinessUI) => void
  onDelete: (id: number) => void
  onTogglePin: (business: BusinessUI) => void
}

export default function BusinessCard({ business, onEdit, onDelete, onTogglePin }: BusinessCardProps) {
  return (
    <div
      style={{
        padding: '1rem',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
          <button
            onClick={() => onTogglePin(business)}
            title={business.pinnedToSidebar ? 'הסר מהתפריט' : 'הצמד לתפריט'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              padding: '0.1rem',
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {business.pinnedToSidebar ? '\u2B50' : '\u2606'}
          </button>
          <span style={{ fontWeight: 600, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{business.name}</span>
          <span style={{
            fontSize: '0.75rem',
            padding: '0.15rem 0.5rem',
            background: business.type === 'personal' ? '#dbeafe' : business.type === 'teacher' ? '#fef3c7' : '#dcfce7',
            color: business.type === 'personal' ? '#1e40af' : business.type === 'teacher' ? '#92400e' : '#166534',
            borderRadius: '0.25rem',
            flexShrink: 0,
          }}>
            {business.type === 'personal' ? '\u05D0\u05D9\u05E9\u05D9' : business.type === 'teacher' ? '\u05DE\u05D5\u05E8\u05D4' : '\u05E2\u05E1\u05E7\u05D9'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button
            onClick={() => onEdit(business)}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
              background: 'transparent',
              border: '1px solid #cbd5e1',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              color: '#475569',
            }}
          >
            {'\u05E2\u05E8\u05D5\u05DA'}
          </button>
          <button
            onClick={() => onDelete(business.id)}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
              background: 'transparent',
              border: '1px solid #fecaca',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              color: '#dc2626',
            }}
          >
            {'\u05DE\u05D7\u05E7'}
          </button>
        </div>
      </div>
    </div>
  )
}
