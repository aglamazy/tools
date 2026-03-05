export type ScoutConfig = {
  id?: number
  syncId?: string
  businessId: number
  searchPrompt: string
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  createdAt: string
  updatedAt: string
}
