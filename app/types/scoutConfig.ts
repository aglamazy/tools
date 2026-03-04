export type ScoutConfig = {
  id?: number
  syncId?: string
  businessId: number
  config: Record<string, unknown>
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  createdAt: string
  updatedAt: string
}
