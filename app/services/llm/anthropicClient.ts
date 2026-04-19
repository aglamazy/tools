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

      // Anthropic path here is used for plain text chats only — tool calls are
      // not supported in this client. Collapse tool-call / tool-result messages
      // to plain text so we don't break simple flows that use Claude.
      const anthropicMessages = messages
        .map(m => {
          if (m.role === 'tool') {
            const text = m.toolResults.map(r => `${r.name}: ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result)}`).join('\n')
            return { role: 'user' as const, content: text }
          }
          if (m.role === 'assistant') {
            const text = m.content ?? (m.toolCalls?.length ? m.toolCalls.map(c => `[called ${c.name}]`).join(' ') : '')
            return { role: 'assistant' as const, content: text }
          }
          return { role: 'user' as const, content: m.content }
        })
        .filter(m => m.content)

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system,
        messages: anthropicMessages,
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
