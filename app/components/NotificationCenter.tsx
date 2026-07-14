'use client'

import { useState } from 'react'
import type { Notification } from '@/app/types/notifications'

type NotificationCenterProps = {
  notifications: Notification[]
  onClear: () => void
  onDismiss: (id: string) => void
}

export default function NotificationCenter({ notifications, onClear, onDismiss }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)

  const getEmoji = (type: Notification['type']) => {
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

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 1) return 'עכשיו'
    if (minutes < 60) return `לפני ${minutes} דקות`
    if (hours < 24) return `לפני ${hours} שעות`
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell Icon */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.5rem',
          padding: '0.5rem',
        }}
      >
        🔔
        {notifications.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '0',
              right: '0',
              backgroundColor: '#ef4444',
              color: 'white',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              fontSize: '0.625rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
            }}
          >
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 998,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 0.5rem)',
              left: '0',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              width: '400px',
              maxHeight: '500px',
              zIndex: 999,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '1rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>התראות</h3>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  נקה הכל
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: '3rem 1rem',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '0.875rem',
                  }}
                >
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔕</div>
                  <p style={{ margin: 0 }}>אין התראות חדשות</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={notification.href ? () => {
                      setIsOpen(false)
                      const target = notification.href!
                      if (window.location.pathname + window.location.search === target) {
                        // Already on this page — just refresh data
                        window.dispatchEvent(new Event('shared-data-updated'))
                      } else {
                        window.location.href = target
                      }
                    } : undefined}
                    style={{
                      padding: '1rem',
                      borderBottom: '1px solid #f3f4f6',
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-start',
                      cursor: notification.href ? 'pointer' : 'default',
                      ...(notification.href ? { background: '#f0f9ff' } : {}),
                    }}
                  >
                    <span style={{ fontSize: '1.25rem' }}>{getEmoji(notification.type)}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem' }}>{notification.message}</p>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {formatTime(notification.timestamp)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {notification.href && <span style={{ fontSize: '0.85rem', color: '#3b82f6' }}>{'◀'}</span>}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDismiss(notification.id)
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          lineHeight: 1,
                          padding: '0.25rem',
                        }}
                        aria-label="Dismiss notification"
                        title="Dismiss notification"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
