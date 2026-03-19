export type AgentTaskStatus = 'pending' | 'in_progress' | 'done' | 'failed'

export interface Bot {
  id: string          // Firestore doc ID
  name: string        // User-chosen display name (e.g. "AglaBot")
  handle: string      // System-generated unique handle
  tokenHash: string   // SHA-256 hash of the secret token
  createdAt: string   // ISO timestamp
}

export interface AgentTask {
  id: string           // Firestore doc ID
  botId: string
  botHandle: string
  localTaskId: number  // Dexie task ID
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  status: AgentTaskStatus
  result: string | null
  createdAt: string    // ISO timestamp
  updatedAt: string    // ISO timestamp
}
