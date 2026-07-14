'use client'

import { useEffect, useRef, useState, useCallback, createContext, useContext, ReactNode } from 'react'
import Toast from './Toast'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import type { ToastType, ToastData, Notification } from '@/app/types/notifications'

const MAX_BELL_NOTIFICATIONS = 50

type ToastContextType = {
  showToast: (type: ToastType, message: string, emoji?: string, duration?: number, href?: string) => void
  notifications: Notification[]
  clearNotifications: () => void
  dismissNotification: (id: string) => void
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
  const dismissedNotificationIdsRef = useRef(new Set<string>())
  const clearedAllBeforeHydrationRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const loadNotifications = async () => {
      const storedNotifications = await appSettingsStore.getBellNotifications()
      if (cancelled) return

      const filteredStoredNotifications = clearedAllBeforeHydrationRef.current
        ? []
        : storedNotifications.filter((notification) => !dismissedNotificationIdsRef.current.has(notification.id))

      setNotifications((current) => mergeNotifications(current, filteredStoredNotifications))
      clearedAllBeforeHydrationRef.current = false
    }

    void loadNotifications()

    return () => {
      cancelled = true
    }
  }, [])

  const showToast = useCallback((type: ToastType, message: string, emoji?: string, duration?: number, href?: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, type, message, emoji, duration }])

    const notification: Notification = { id, type, message, timestamp: new Date(), href }

    setNotifications((prev) => mergeNotifications([notification, ...prev], []))
    void appSettingsStore.addBellNotification(notification)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const clearNotifications = useCallback(() => {
    clearedAllBeforeHydrationRef.current = true
    dismissedNotificationIdsRef.current.clear()
    setNotifications([])
    void appSettingsStore.clearBellNotifications()
  }, [])

  const dismissNotification = useCallback((id: string) => {
    dismissedNotificationIdsRef.current.add(id)
    setNotifications((prev) => prev.filter((notification) => notification.id !== id))
    void appSettingsStore.clearBellNotification(id)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, notifications, clearNotifications, dismissNotification }}>
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

const mergeNotifications = (current: Notification[], next: Notification[]) => {
  const merged = new Map<string, Notification>()
  for (const notification of current) {
    merged.set(notification.id, notification)
  }
  for (const notification of next) {
    if (!merged.has(notification.id)) {
      merged.set(notification.id, notification)
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, MAX_BELL_NOTIFICATIONS)
}
