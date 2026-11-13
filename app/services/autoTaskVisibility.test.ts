import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/app/db/financeDB'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { visibleTasks } from './autoTaskVisibility'

// aglamazo#473: per-member "hide automatic reminders" on the Eisenhower matrix.

type T = { id: string; taskType: 'auto' | 'user'; quadrant: string }
const quadrants = ['do', 'schedule', 'delegate', 'eliminate']
const tasks: T[] = quadrants.flatMap((q, i) => [
  { id: `u${i}`, taskType: 'user' as const, quadrant: q },
  { id: `a${i}`, taskType: 'auto' as const, quadrant: q },
])

describe('visibleTasks (aglamazo#473)', () => {
  it('hideAuto=true drops every auto task in all four quadrants, user tasks unchanged', () => {
    const out = visibleTasks(tasks, true)
    expect(out).toEqual(tasks.filter(t => t.taskType === 'user'))
    expect(out.map(t => t.quadrant).sort()).toEqual([...quadrants].sort())
    out.forEach(t => expect(tasks).toContain(t))
  })

  it('hideAuto=false returns the same list', () => {
    expect(visibleTasks(tasks, false)).toEqual(tasks)
  })
})

describe('appSettingsStore hideAutoTasks flag (aglamazo#473)', () => {
  const store = new Map<string, string>()
  beforeEach(async () => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size },
    })
    await db.appSettings.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is stored per member and toggles back', async () => {
    await appSettingsStore.setHideAutoTasks('a', true)
    expect(await appSettingsStore.getHideAutoTasks('a')).toBe(true)
    expect(await appSettingsStore.getHideAutoTasks('b')).toBe(false)
    await appSettingsStore.setHideAutoTasks('a', false)
    expect(await appSettingsStore.getHideAutoTasks('a')).toBe(false)
  })

  it('writes one appSettings row and nothing to localStorage', async () => {
    await appSettingsStore.setHideAutoTasks('a', true)
    const rows = await db.appSettings.where('key').equals('todoHideAutoTasks:a').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe(true)
    expect((await db.appSettings.toArray()).filter(r => String(r.key).includes('todoHideAutoTasks'))).toHaveLength(1)
    expect([...store.keys()].filter(k => k.includes('todoHideAutoTasks'))).toEqual([])
    expect(store.get('todoHideAutoTasks:a')).toBeUndefined()
  })
})
