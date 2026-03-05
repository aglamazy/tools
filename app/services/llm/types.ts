export type LLMProvider = 'gemini' | 'anthropic'

export type LLMMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type LLMChatOptions = {
  system: string
  messages: LLMMessage[]
  enableWebSearch?: boolean
  maxTokens?: number
  apiKey?: string
}

export type LLMResult = {
  text: string
  error?: string
}

export interface LLMClient {
  chat(options: LLMChatOptions): Promise<LLMResult>
}
