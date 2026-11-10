import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { exportAllStores, importAllStores } from './backupService'
import { clearLocalUserState } from './clearLocalUserState'

// aglamazo#472: the accounting tab's students (and profileQAs, scoutConfigs, scoutResults)
// never reached the backup payload, so a sign-out wipe lost them for good.
describe('students survive backup -> local wipe -> restore (aglamazo#472)', () => {
  beforeEach(async () => {
    await clearLocalUserState()
  })

  it('a student and the 3 other tables are in the payload and come back after the wipe', async () => {
    const now = new Date().toISOString()
    await db.students.add({ businessId: 'biz-sync-1', name: 'משה לוי', lessonRate: 180, archived: false, createdAt: now, updatedAt: now })
    await db.profileQAs.add({ businessId: 'biz-sync-1', question: 'q', answer: 'a', answerType: 'text', createdAt: now, updatedAt: now } as any)
    await db.scoutConfigs.add({ businessId: 'biz-sync-1', searchPrompt: 'grants', conversationHistory: [], createdAt: now, updatedAt: now })
    await db.scoutResults.add({ businessId: 'biz-sync-1', title: 'grant', summary: 's', status: 'new', createdAt: now, updatedAt: now } as any)

    const payload = await exportAllStores()
    expect(payload.stores.students).toHaveLength(1)
    expect(payload.stores.students![0]).toMatchObject({ name: 'משה לוי', businessId: 'biz-sync-1' })
    expect(payload.stores.students![0].syncId).toBeTruthy()
    for (const t of 'profileQAs scoutConfigs scoutResults'.split(' ')) {
      expect((payload.stores as Record<string, unknown[]>)[t]).toHaveLength(1)
    }

    await clearLocalUserState() // what a sign-out does
    expect(await db.students.count()).toBe(0)

    await importAllStores(JSON.parse(JSON.stringify(payload)))
    const back = await db.students.toArray()
    expect(back.map((s) => s.name)).toEqual(['משה לוי'])
    expect(back[0].syncId).toBe(payload.stores.students![0].syncId)
    expect(await db.scoutConfigs.count()).toBe(1)
  })
})
