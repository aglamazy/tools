// Timer Store - Active timer state in localStorage

const TIMER_STORAGE_KEY = 'harvest-active-timer'

export type ActiveTimer = {
  projectId: number
  taskId: number
  startedAt: string // ISO timestamp
}

export const timerStore = {
  get: (): ActiveTimer | null => {
    try {
      const stored = localStorage.getItem(TIMER_STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored) as ActiveTimer
      }
      return null
    } catch {
      localStorage.removeItem(TIMER_STORAGE_KEY)
      return null
    }
  },

  set: (timer: ActiveTimer): void => {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer))
  },

  clear: (): void => {
    localStorage.removeItem(TIMER_STORAGE_KEY)
  },

  export: (): ActiveTimer | null => {
    return timerStore.get()
  },

  import: (data: ActiveTimer | null): void => {
    if (data) {
      timerStore.set(data)
    } else {
      timerStore.clear()
    }
  },
}
