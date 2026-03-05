import type { LLMProvider } from '@/app/services/llm/types'

const PROVIDER_KEY = 'scout_llm_provider'
const ANTHROPIC_KEY = 'scout_anthropic_api_key'

export const llmPrefsStore = {
  getProvider: (): LLMProvider => {
    if (typeof window === 'undefined') return 'gemini'
    return (localStorage.getItem(PROVIDER_KEY) as LLMProvider) || 'gemini'
  },

  setProvider: (provider: LLMProvider): void => {
    localStorage.setItem(PROVIDER_KEY, provider)
  },

  getAnthropicKey: (): string => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(ANTHROPIC_KEY) || ''
  },

  setAnthropicKey: (key: string): void => {
    localStorage.setItem(ANTHROPIC_KEY, key)
  },
}
