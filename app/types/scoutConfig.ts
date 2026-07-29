export type ScoutConfig = {
  id?: number
  syncId?: string
  businessId: string
  searchPrompt: string
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  createdAt: string
  updatedAt: string
}
