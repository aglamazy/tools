// Timer Store — active timer state, backed by appSettings key `activeTimer`.
// Was localStorage (key `harvest-active-timer`) until the subjectStore/
// timerStore → Dexie migration (see financeDB.ts's Subject docs) folded this
// into the existing appSettings synced table — a single-row settings value
// fits appSettings' established &key pattern exactly, so no new table was
// needed. Every method is async now.

import { db } from '@/app/db/financeDB'

const TIMER_KEY = 'activeTimer'

export type ActiveTimer = {
  projectId: number
  taskId: number
  startedAt: string // ISO timestamp
}

export const timerStore = {
  get: async (): Promise<ActiveTimer | null> => {
    try {
      const row = await db.appSettings.where('key').equals(TIMER_KEY).first()
      return (row?.value as ActiveTimer | undefined) ?? null
    } catch {
      return null
    }
  },

  set: async (timer: ActiveTimer): Promise<void> => {
    const existing = await db.appSettings.where('key').equals(TIMER_KEY).first()
    if (existing) {
      await db.appSettings.update(existing.id!, { value: timer, updatedAt: new Date().toISOString() })
    } else {
      await db.appSettings.add({ key: TIMER_KEY, value: timer, updatedAt: new Date().toISOString() })
    }
  },

  clear: async (): Promise<void> => {
    const existing = await db.appSettings.where('key').equals(TIMER_KEY).first()
    if (existing) await db.appSettings.delete(existing.id!)
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
