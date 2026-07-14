export type ToastType = 'success' | 'error' | 'info' | 'warning'

export type ToastData = {
  id: string
  type: ToastType
  message: string
  emoji?: string
  duration?: number
}

export type Notification = {
  id: string
  type: ToastType
  message: string
  timestamp: Date
  href?: string
}

export type StoredNotification = {
  id: string
  type: ToastType
  message: string
  timestamp: string
  href?: string
  clearedAt?: string
}
