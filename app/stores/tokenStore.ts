const TOKEN_LIFETIME_MS = 55 * 60 * 1000 // 55 minutes

export const tokenStore = {
  load: (key: string): string | null => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        const { token, expiresAt } = JSON.parse(stored)
        if (expiresAt > Date.now()) return token
        localStorage.removeItem(key)
      }
    } catch {
      localStorage.removeItem(key)
    }
    return null
  },

  save: (key: string, token: string, lifetimeMs = TOKEN_LIFETIME_MS): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(key, JSON.stringify({
        token,
        expiresAt: Date.now() + lifetimeMs,
      }))
    } catch {
      // Ignore storage errors
    }
  },

  clear: (key: string): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(key)
    } catch {
      // Ignore storage errors
    }
  },
}
