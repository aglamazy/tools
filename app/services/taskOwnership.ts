import { db, type Task } from '@/app/db/financeDB'

// aglamazo#474 — each household member has their own task list.
// A task belongs to the list of `ownerUid`. Tasks created before this existed
// have no owner; they go to the PRIMARY USER: the household owner (the member
// who created the household and invited the partner), or the current user
// when there is no household.

/** The uid that owns tasks with no ownerUid. */
export function resolvePrimaryUid(currentUid: string, household?: { ownerId: string } | null): string {
  return household?.ownerId || currentUid
}

/**
 * Set ownerUid = primaryUid on every task that has none. Never changes a task
 * that already has an owner. Idempotent. Returns how many rows changed.
 */
export async function assignTaskOwners(primaryUid: string): Promise<number> {
  if (!primaryUid) throw new Error('assignTaskOwners: primaryUid is required')
  return db.tasks.filter(t => !t.ownerUid).modify({ ownerUid: primaryUid })
}

/**
 * Is this task on the list of `listUid`? Automatic reminders (autoTaskId)
 * are shared and always on every list; visibility of those is aglamazo#473.
 */
export function isOnList(task: Pick<Task, 'autoTaskId' | 'ownerUid'>, listUid: string, primaryUid: string): boolean {
  if (task.autoTaskId) return true
  return (task.ownerUid ?? primaryUid) === listUid
}
