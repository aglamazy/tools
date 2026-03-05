import Anthropic from '@anthropic-ai/sdk'
import type { LLMClient, LLMChatOptions, LLMResult } from './types'

export class AnthropicClient implements LLMClient {
  async chat(options: LLMChatOptions): Promise<LLMResult> {
    if (!options.apiKey) {
      return { text: '', error: 'חסר מפתח Anthropic API' }
    }

    const { apiKey, system, messages, enableWebSearch, maxTokens = 4096 } = options

    try {
      const client = new Anthropic({ apiKey })

      const tools: any[] = []
      if (enableWebSearch) {
        tools.push({
          type: 'web_search_20250305' as const,
          name: 'web_search',
          max_uses: 5,
        })
      }

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        ...(tools.length > 0 && { tools }),
      })

      let text = ''
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text
        }
      }

      if (!text) return { text: '', error: 'Claude לא החזיר תשובה' }
      return { text }
    } catch (err: any) {
      console.error('[LLM/Anthropic] Error:', err)
      if (err.status === 401) return { text: '', error: 'מפתח Anthropic API לא תקין' }
      if (err.status === 429) return { text: '', error: 'חריגה ממכסה. נסה שוב בעוד דקה' }
      return { text: '', error: 'שגיאה בקריאה ל-Claude' }
    }
  }
}
