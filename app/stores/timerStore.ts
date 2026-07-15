// Timer Store - Active timer state
//
// Dexie-backed (db.activeTimer, a singleton row keyed by ACTIVE_KEY) as of
// #253 phase 1 — every method here is now ASYNC. readLegacyLocalStorage() is
// the one exception — a read-only escape hatch for the one-time migration
// (see app/services/migrations/migrateLegacyStoresToDexie.ts) to reach the
// old localStorage blob; every other method here is Dexie-only.

import { db } from '@/app/db/financeDB'

const TIMER_STORAGE_KEY = 'harvest-active-timer'

const ACTIVE_KEY = 'active'

export type ActiveTimer = {
  projectId: number
  taskId: number
  startedAt: string // ISO timestamp
}

export const timerStore = {
  // Read-only escape hatch for the one-time legacy migration — the only
  // place in this store that still touches localStorage.
  readLegacyLocalStorage: (): ActiveTimer | null => {
    try {
      const stored = localStorage.getItem(TIMER_STORAGE_KEY)
      return stored ? (JSON.parse(stored) as ActiveTimer) : null
    } catch (err) {
      console.error('Error reading legacy timerStore localStorage:', err)
      return null
    }
  },

  get: async (): Promise<ActiveTimer | null> => {
    try {
      const row = await db.activeTimer.where('key').equals(ACTIVE_KEY).first()
      if (!row) return null
      return { projectId: row.projectId, taskId: row.taskId, startedAt: row.startedAt }
    } catch (err) {
      console.error('Error loading active timer:', err)
      return null
    }
  },

  set: async (timer: ActiveTimer): Promise<void> => {
    try {
      await db.transaction('rw', db.activeTimer, async () => {
        const existing = await db.activeTimer.where('key').equals(ACTIVE_KEY).first()
        if (existing?.id != null) {
          await db.activeTimer.update(existing.id, { ...timer, key: ACTIVE_KEY })
        } else {
          await db.activeTimer.add({ key: ACTIVE_KEY, ...timer })
        }
      })
    } catch (err) {
      console.error('Error saving active timer:', err)
    }
  },

  clear: async (): Promise<void> => {
    try {
      await db.activeTimer.where('key').equals(ACTIVE_KEY).delete()
    } catch (err) {
      console.error('Error clearing active timer:', err)
    }
  },

  export: async (): Promise<ActiveTimer | null> => {
    return timerStore.get()
  },

  import: async (data: ActiveTimer | null): Promise<void> => {
    if (data) {
      await timerStore.set(data)
    } else {
      await timerStore.clear()
    }
  },
}
