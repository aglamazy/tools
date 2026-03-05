import type { LLMClient, LLMProvider } from './types'
import { GeminiClient } from './geminiClient'
import { AnthropicClient } from './anthropicClient'

export type { LLMProvider, LLMMessage, LLMChatOptions, LLMResult, LLMClient } from './types'

const clients: Record<LLMProvider, LLMClient> = {
  gemini: new GeminiClient(),
  anthropic: new AnthropicClient(),
}

export function getLLMClient(provider: LLMProvider = 'gemini'): LLMClient {
  return clients[provider]
}
