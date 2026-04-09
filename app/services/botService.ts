/**
 * Bot Service — client-side bot management and task delegation.
 * Talks to /api/agent/bots endpoints (Firebase auth) and
 * writes agentTasks to Firestore for real-time subscription.
 */

import { getIdToken } from './firebaseAuthService'
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured } from '@/app/lib/firebase'
import { getUser } from '@/app/stores/authStore'
import type { AgentTask, AgentTaskStatus } from '@/app/types/bot'

export type BotSummary = {
  id: string
  name: string
  handle: string
  createdAt: string
}

export type CreatedBot = BotSummary & { token: string }

async function authFetch(url: string, options: RequestInit = {}) {
  const idToken = await getIdToken()
  if (!idToken) throw new Error('Not authenticated')
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      ...options.headers,
    },
  })
}

export async function listBots(): Promise<BotSummary[]> {
  const res = await authFetch('/api/agent/bots')
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Failed to list bots')
  return data.bots
}

export async function createBot(name: string): Promise<CreatedBot> {
  const res = await authFetch('/api/agent/bots', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Failed to create bot')
  return data.bot
}

export async function deleteBot(id: string): Promise<void> {
  const res = await authFetch(`/api/agent/bots/${id}`, { method: 'DELETE' })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Failed to delete bot')
}

/**
 * Create an agent task in Firestore when delegating to a bot.
 * Returns the Firestore doc ID.
 */
export async function createAgentTask(params: {
  botId: string
  botHandle: string
  localTaskId: number
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
}): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured')
  const user = getUser()
  if (!user) throw new Error('Not authenticated')

  const firestore = getFirebaseFirestore()
  const now = new Date().toISOString()

  const docRef = await addDoc(
    collection(firestore, `users/${user.uid}/agentTasks`),
    {
      botId: params.botId,
      botHandle: params.botHandle,
      localTaskId: params.localTaskId,
      title: params.title,
      description: params.description,
      priority: params.priority,
      status: 'pending' as AgentTaskStatus,
      result: null,
      createdAt: now,
      updatedAt: now,
    }
  )

  return docRef.id
}

/**
 * Mark a webhook-created agent task as claimed (sets localTaskId so it won't be re-imported).
 */
export async function markWebhookTaskClaimed(agentTaskId: string, localTaskId: number): Promise<void> {
  if (!isFirebaseConfigured()) return
  const user = getUser()
  if (!user) return
  const firestore = getFirebaseFirestore()
  const docRef = doc(firestore, `users/${user.uid}/agentTasks`, agentTaskId)
  await updateDoc(docRef, { localTaskId })
}

/**
 * Subscribe to real-time status updates for agent tasks.
 * Calls onChange whenever any agent task for the current user changes.
 * Also calls onWebhookTask for webhook-created tasks (localTaskId === 0)
 * so the client can auto-create a local Dexie task.
 */
export function subscribeToAgentTasks(
  onChange: (tasks: AgentTask[]) => void,
  onWebhookTask?: (task: AgentTask & { quadrant?: string; deadline?: string; subject?: string; tags?: string[] }) => void,
): Unsubscribe | null {
  if (!isFirebaseConfigured()) return null
  const user = getUser()
  if (!user) return null

  const firestore = getFirebaseFirestore()
  const q = query(
    collection(firestore, `users/${user.uid}/agentTasks`),
    where('status', 'in', ['pending', 'in_progress'])
  )

  const seenWebhookIds = new Set<string>()

  return onSnapshot(q, (snapshot) => {
    const tasks: AgentTask[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as AgentTask))
    onChange(tasks)

    // Detect webhook-created tasks (localTaskId === 0) and notify
    if (onWebhookTask) {
      for (const doc of snapshot.docs) {
        const data = doc.data()
        if (data.source === 'webhook' && data.localTaskId === 0 && !seenWebhookIds.has(doc.id)) {
          seenWebhookIds.add(doc.id)
          onWebhookTask({ id: doc.id, ...data } as any)
        }
      }
    }
  })
}
