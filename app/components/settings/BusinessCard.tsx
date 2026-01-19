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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              onClick={() => onTogglePin(business)}
              title={business.pinnedToSidebar ? 'הסר מהתפריט' : 'הצמד לתפריט'}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.1rem',
                padding: '0.1rem',
                opacity: business.pinnedToSidebar ? 1 : 0.4,
              }}
            >
              ...
            </button>
            <span style={{ fontSize: '1.25rem' }}>
              {business.type === 'personal' ? '...' : '...'}
            </span>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>{business.name}</span>
            <span style={{
              fontSize: '0.75rem',
              padding: '0.15rem 0.5rem',
              background: business.type === 'personal' ? '#dbeafe' : '#dcfce7',
              color: business.type === 'personal' ? '#1e40af' : '#166534',
              borderRadius: '0.25rem',
            }}>
              {business.type === 'personal' ? 'אישי' : 'עסקי'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
            ערוך
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
            מחק
          </button>
        </div>
      </div>
    </div>
  )
}
