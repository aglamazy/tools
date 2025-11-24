'use client'

import { useEffect } from 'react'
import type { ToastType } from '@/app/types/notifications'

type ToastProps = {
  id: string
  type: ToastType
  message: string
  emoji?: string
  duration?: number
  onClose: (id: string) => void
}

export default function Toast({ id, type, message, emoji, duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id)
    }, duration)

    return () => clearTimeout(timer)
  }, [id, duration, onClose])

  const getDefaultEmoji = () => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
    }
  }

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return '#10b981'
      case 'error':
        return '#ef4444'
      case 'warning':
        return '#f59e0b'
      case 'info':
        return '#3b82f6'
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem 1.25rem',
        backgroundColor: getBackgroundColor(),
        color: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        minWidth: '300px',
        maxWidth: '500px',
        cursor: 'pointer',
        animation: 'slideIn 0.3s ease-out',
      }}
      onClick={() => onClose(id)}
    >
      <span style={{ fontSize: '1.5rem' }}>{emoji || getDefaultEmoji()}</span>
      <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{message}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose(id)
        }}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '1.25rem',
          padding: '0',
          opacity: 0.7,
        }}
      >
        ✕
      </button>
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
