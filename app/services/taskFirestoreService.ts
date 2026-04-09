/**
 * Server-side task CRUD — Firestore collection userTasks/{uid}/items.
 * Used by the chat bot. Client syncs this collection to Dexie.
 */

import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskQuadrant = 'do' | 'schedule' | 'delegate' | 'eliminate'

export interface FirestoreTask {
  id: string
  title: string
  completed: boolean
  priority: TaskPriority
  quadrant: TaskQuadrant
  deadline?: string
  createdAt: string
  updatedAt: string
}

function col(uid: string) {
  return getAdminFirestore().collection('userTasks').doc(uid).collection('items')
}

export async function listTasks(uid: string): Promise<FirestoreTask[]> {
  const snap = await col(uid).orderBy('createdAt', 'desc').get()
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreTask))
}

export async function createTask(
  uid: string,
  title: string,
  opts: { priority?: TaskPriority; quadrant?: TaskQuadrant; deadline?: string } = {},
): Promise<FirestoreTask> {
  const now = new Date().toISOString()
  const data: Omit<FirestoreTask, 'id'> = {
    title: title.trim(),
    completed: false,
    priority: opts.priority || 'medium',
    quadrant: opts.quadrant || 'do',
    deadline: opts.deadline,
    createdAt: now,
    updatedAt: now,
  }
  if (!data.deadline) delete data.deadline
  const ref = await col(uid).add(data)
  return { id: ref.id, ...data }
}

export async function updateTask(
  uid: string,
  id: string,
  updates: Partial<Pick<FirestoreTask, 'title' | 'completed' | 'priority' | 'quadrant' | 'deadline'>>,
): Promise<void> {
  await col(uid).doc(id).update({ ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteTask(uid: string, id: string): Promise<void> {
  await col(uid).doc(id).delete()
}

/** Find tasks whose title contains the query (case-insensitive, client-side filter). */
export async function findTasks(uid: string, query: string): Promise<FirestoreTask[]> {
  const all = await listTasks(uid)
  const q = query.toLowerCase()
  return all.filter(t => t.title.toLowerCase().includes(q))
}
