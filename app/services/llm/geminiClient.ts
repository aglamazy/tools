import type { LLMClient, LLMChatOptions, LLMResult, LLMChatWithToolsOptions, LLMResultWithTools } from './types'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export class GeminiClient implements LLMClient {
  async chat(options: LLMChatOptions): Promise<LLMResult> {
    const result = await this.chatWithTools(options)
    return result
  }

  async chatWithTools(options: LLMChatWithToolsOptions): Promise<LLMResultWithTools> {
    if (!GEMINI_API_KEY) {
      return { text: '', error: 'חסר מפתח Gemini API' }
    }

    const { system, messages, enableWebSearch, maxTokens = 4096, tools: fnTools } = options

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    if (contents.length > 0 && contents[0].role === 'user') {
      contents[0].parts[0].text = `${system}\n\n${contents[0].parts[0].text}`
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
    }

    // Build tools array: function declarations + optional google search
    const toolsArray: Record<string, unknown>[] = []
    if (fnTools?.length) {
      toolsArray.push({ functionDeclarations: fnTools })
    }
    if (enableWebSearch) {
      toolsArray.push({ googleSearch: {} })
    }
    if (toolsArray.length > 0) {
      body.tools = toolsArray
    }

    try {
      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error('[LLM/Gemini] Error:', response.status, errorBody)
        if (response.status === 429) return { text: '', error: 'חריגה ממכסה. נסה שוב בעוד דקה' }
        if (response.status === 400) return { text: '', error: `שגיאה 400: ${errorBody.slice(0, 200)}` }
        return { text: '', error: 'שגיאה בקריאה ל-Gemini' }
      }

      const data = await response.json()
      const candidate = data.candidates?.[0]
      const parts: any[] = candidate?.content?.parts || []

      if (!parts.length) {
        console.log('[LLM/Gemini] Raw candidate:', JSON.stringify(candidate).slice(0, 500))
      }

      const thinking = parts.filter(p => p.thought && p.text).map(p => p.text).join('').trim()
      const text = parts.filter(p => !p.thought && p.text).map(p => p.text).join('') || ''
      const functionCalls = parts
        .filter(p => p.functionCall)
        .map(p => ({ name: p.functionCall.name as string, args: (p.functionCall.args || {}) as Record<string, unknown> }))

      console.log('[LLM/Gemini] parts:', parts.length, 'text:', text.length, 'functionCalls:', functionCalls.length,
        functionCalls.length ? functionCalls.map(fc => fc.name).join(',') : '')

      if (!text && !functionCalls.length) return { text: '', error: 'Gemini לא החזיר תשובה' }

      const groundingSources = (candidate?.groundingMetadata?.groundingChunks || [])
        .filter((chunk: any) => chunk.web?.uri)
        .map((chunk: any) => ({
          url: chunk.web.uri,
          title: chunk.web.title,
        }))

      return {
        text,
        thinking: thinking || undefined,
        groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
        functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      }
    } catch (err: any) {
      console.error('[LLM/Gemini] Error:', err)
      return { text: '', error: 'שגיאת רשת בקריאה ל-Gemini' }
    }
  }
}
