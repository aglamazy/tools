import type { LLMMessage, LLMProvider } from '@/app/services/llm'

export type Product = {
  name: string
  description: string
  price: string
  url: string
  image?: string
  unitPrice?: string
  quantity?: string
}

export type GroundingSource = {
  url: string
  title?: string
}

export type SearchStrategyId = 'gemini-web' | 'claude-web'

export type SearchResult = {
  text: string
  products: Product[]
  groundingSources: GroundingSource[]
}

export type SearchStrategy = {
  id: SearchStrategyId
  label: string
  subtitle: string
  requiresUserKey: boolean
  execute: (messages: LLMMessage[], apiKey?: string) => Promise<SearchResult>
}

export type { LLMMessage, LLMProvider }
