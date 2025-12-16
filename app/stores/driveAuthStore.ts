// Drive auth token storage - kept in a store to comply with repository pattern

const DRIVE_AUTH_STORAGE_KEY = 'finance-drive-auth'

export type DriveAuthState = {
  accessToken: string
  expiresAt: number
  scope: string
}

export const driveAuthStore = {
  get: (): DriveAuthState | null => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(DRIVE_AUTH_STORAGE_KEY)
      return raw ? (JSON.parse(raw) as DriveAuthState) : null
    } catch (err) {
      console.error('Error reading Drive auth from storage:', err)
      return null
    }
  },

  save: (auth: DriveAuthState) => {
    try {
      localStorage.setItem(DRIVE_AUTH_STORAGE_KEY, JSON.stringify(auth))
    } catch (err) {
      console.error('Error saving Drive auth:', err)
    }
  },

  clear: () => {
    try {
      localStorage.removeItem(DRIVE_AUTH_STORAGE_KEY)
    } catch (err) {
      console.error('Error clearing Drive auth:', err)
    }
  },
}
