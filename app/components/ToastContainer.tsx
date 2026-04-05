'use client'

import { useState, useCallback, createContext, useContext, ReactNode } from 'react'
import Toast from './Toast'
import NotificationCenter from './NotificationCenter'
import type { ToastType, ToastData, Notification } from '@/app/types/notifications'

type ToastContextType = {
  showToast: (type: ToastType, message: string, emoji?: string, duration?: number, href?: string) => void
  notifications: Notification[]
  clearNotifications: () => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

type ToastProviderProps = {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])

  const showToast = useCallback((type: ToastType, message: string, emoji?: string, duration?: number, href?: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, type, message, emoji, duration }])

    // Add to notification history
    setNotifications((prev) => [
      { id, type, message, timestamp: new Date(), href },
      ...prev,
    ])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, notifications, clearNotifications }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: '1rem',
          left: '1rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <Toast
              id={toast.id}
              type={toast.type}
              message={toast.message}
              emoji={toast.emoji}
              duration={toast.duration}
              onClose={removeToast}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
