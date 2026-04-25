'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import CategoriesTab from '@/app/components/settings/CategoriesTab'

export default function SubjectsOverlay({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#fff',
          zIndex: 999998,
          direction: 'rtl',
          overflow: 'auto',
          paddingTop: '56px',
        }}
      >
        <div style={{ padding: '1rem 1.25rem' }}>
          <CategoriesTab />
        </div>
      </div>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.25rem',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
          zIndex: 999999,
          direction: 'rtl',
          boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
        }}
      >
        <strong style={{ fontSize: '1rem' }}>ניהול נושאים</strong>
        <button
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            fontSize: '0.95rem',
            cursor: 'pointer',
            padding: '0.45rem 0.9rem',
            borderRadius: '0.5rem',
            fontWeight: 600,
          }}
          aria-label="סגור וחזור לתקציב"
          title="ESC"
        >
          ✕ חזור לתקציב
        </button>
      </div>
    </>,
    document.body
  )
}
