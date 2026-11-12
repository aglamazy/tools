import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db, type Task } from '@/app/db/financeDB'

// aglamazo#474: each household member has their own task list. Existing tasks
// (no ownerUid) go to the primary user = the household owner, or the user
// themself when there is no household.

let currentUid: string | null = 'owner'
vi.mock('@/app/stores/authStore', () => ({
  getUser: () => (currentUid ? { uid: currentUid } : null),
}))

import { assignTaskOwners, resolvePrimaryUid, isOnList } from './taskOwnership'
import { todoStore } from '@/app/stores/todoStore'

const task = (title: string, extra: Partial<Task> = {}): Omit<Task, 'id'> => ({
  title, completed: false, priority: 'medium', quadrant: 'do', createdAt: '2026-11-12T00:00:00.000Z', ...extra,
})

beforeEach(async () => {
  currentUid = 'owner'
  await db.tasks.clear()
})

describe('assignTaskOwners (aglamazo#474)', () => {
  it('household: ownerless tasks go to the household owner, an owned task is left alone', async () => {
    await db.tasks.bulkAdd([task('a'), task('b'), task('c'), task('d', { ownerUid: 'partner' })])
    const primary = resolvePrimaryUid('partner', { ownerId: 'owner' })
    expect(primary).toBe('owner')
    expect(await assignTaskOwners(primary)).toBe(3)
    const rows = await db.tasks.toArray()
    expect(rows.filter(t => t.title !== 'd').map(t => t.ownerUid)).toEqual(['owner', 'owner', 'owner'])
    expect(rows.find(t => t.title === 'd')!.ownerUid).toBe('partner')
  })

  it('no household: every task becomes the current user\'s', async () => {
    await db.tasks.bulkAdd([task('a'), task('b')])
    const primary = resolvePrimaryUid('solo', null)
    expect(primary).toBe('solo')
    expect(await assignTaskOwners(primary)).toBe(2)
    expect((await db.tasks.toArray()).every(t => t.ownerUid === 'solo')).toBe(true)
  })

  it('is idempotent: a second call changes nothing', async () => {
    await db.tasks.bulkAdd([task('a'), task('b')])
    expect(await assignTaskOwners('owner')).toBe(2)
    expect(await assignTaskOwners('owner')).toBe(0)
    expect(await assignTaskOwners('someone-else')).toBe(0)
    expect((await db.tasks.toArray()).every(t => t.ownerUid === 'owner')).toBe(true)
  })
})

describe('isOnList (aglamazo#474)', () => {
  it('own task is on own list only', () => {
    expect(isOnList({ ownerUid: 'me' }, 'me', 'me')).toBe(true)
    expect(isOnList({ ownerUid: 'me' }, 'partner', 'me')).toBe(false)
  })
  it('an automatic reminder (autoTaskId) is on both lists', () => {
    expect(isOnList({ autoTaskId: 'missing-bank-1-01/2026', ownerUid: 'me' }, 'me', 'me')).toBe(true)
    expect(isOnList({ autoTaskId: 'missing-bank-1-01/2026', ownerUid: 'me' }, 'partner', 'me')).toBe(true)
  })
  it('a task without ownerUid is on the primary user\'s list only', () => {
    expect(isOnList({}, 'owner', 'owner')).toBe(true)
    expect(isOnList({}, 'partner', 'owner')).toBe(false)
  })
})

describe('todoStore ownership (aglamazo#474)', () => {
  it('addTask puts the task on the current user\'s list', async () => {
    const t = await todoStore.addTask('new', 'medium')
    expect((await db.tasks.get(t.id))!.ownerUid).toBe('owner')
  })

  it('delegateTask moves the task to the partner; undelegateTask moves it back to the delegator', async () => {
    const id = await db.tasks.add(task('x', { ownerUid: 'owner' }))
    await todoStore.delegateTask(id, 'partner')
    let row = (await db.tasks.get(id))!
    expect(row.ownerUid).toBe('partner')
    expect(row.delegatedBy).toBe('owner')
    await todoStore.undelegateTask(id)
    row = (await db.tasks.get(id))!
    expect(row.ownerUid).toBe('owner')
    expect(row.delegatedTo).toBeUndefined()
  })
})
