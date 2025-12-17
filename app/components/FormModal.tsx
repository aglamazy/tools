'use client'

import { ReactNode } from 'react'
import Modal from './Modal'

type FormModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  title: string
  children: ReactNode
  saveText?: string
  cancelText?: string
  maxWidth?: string
}

export default function FormModal({
  isOpen,
  onClose,
  onSave,
  title,
  children,
  saveText = 'שמור',
  cancelText = 'ביטול',
  maxWidth = '400px',
}: FormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth={maxWidth}>
      <div dir="rtl" style={{ padding: '0.5rem' }}>
        <h3 style={{ margin: '0 0 1.5rem', textAlign: 'center', fontSize: '1.1rem' }}>{title}</h3>

        <div style={{ marginBottom: '1.5rem' }}>
          {children}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
          <button
            onClick={onSave}
            style={{
              padding: '0.6rem 1.25rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {saveText}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.6rem 1.25rem',
              background: '#f1f5f9',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Reusable form field components
export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.95rem' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '1rem',
  boxSizing: 'border-box',
  background: '#fff',
}
