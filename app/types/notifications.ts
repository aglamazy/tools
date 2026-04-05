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
