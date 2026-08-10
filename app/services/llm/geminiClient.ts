import { createGeminiClient } from 'agents-ai/core'
import type { LLMClient, LLMChatOptions, LLMResult, LLMChatWithToolsOptions, LLMResultWithTools } from './types'

/**
 * Default model: the `-latest` alias auto-tracks the freshest stable Flash
 * revision. Cheaper and faster than pinning a specific version, and Google
 * usually rolls reliability fixes (including tool-use regression patches)
 * into the alias before they hit a pinned id. The chat brain can override
 * this per-call via `modelOverride` when it needs to escalate to a heavier
 * model (e.g. when the default jams and returns tool-call pseudocode as text).
 */
const DEFAULT_MODEL = 'gemini-flash-latest'

// agents-ai's client returns English error strings (and runs metering under
// the hood); this app is Hebrew-only, so map its known error shapes back to
// the same Hebrew messages the hand-rolled fetch() used to produce.
function localizeError(error: string): string {
  if (/missing gemini api key/i.test(error)) return 'חסר מפתח Gemini API'
  if (/rate limit/i.test(error)) return 'חריגה ממכסה. נסה שוב בעוד דקה'
  if (/^Gemini HTTP \d+:/i.test(error)) return `שגיאה בקריאה ל-Gemini (${error})`
  if (/empty response/i.test(error)) return `Gemini לא החזיר תשובה (${error})`
  if (/network error/i.test(error)) return 'שגיאת רשת בקריאה ל-Gemini'
  return 'שגיאה בקריאה ל-Gemini'
}

export class GeminiClient implements LLMClient {
  private client = createGeminiClient({ model: DEFAULT_MODEL })

  async chat(options: LLMChatOptions): Promise<LLMResult> {
    const result = await this.chatWithTools(options)
    return result
  }

  async chatWithTools(options: LLMChatWithToolsOptions): Promise<LLMResultWithTools> {
    const { tools: fnTools, ...rest } = options
    const response = await this.client.chat({
      ...rest,
      tools: fnTools?.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })),
    })

    if (response.error) {
      console.error(`[LLM/Gemini] Error:`, response.error)
      return { text: '', error: localizeError(response.error) }
    }

    console.log(
      `[LLM/Gemini:${response.model || DEFAULT_MODEL}] text:`, response.text.length,
      'functionCalls:', response.toolCalls?.length || 0,
      response.toolCalls?.length ? response.toolCalls.map(tc => tc.name).join(',') : '',
    )

    return {
      text: response.text,
      thinking: response.thinking,
      groundingSources: response.groundingSources,
      functionCalls: response.toolCalls,
    }
  }
}
