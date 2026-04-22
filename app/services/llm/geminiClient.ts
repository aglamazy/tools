import type { LLMClient, LLMChatOptions, LLMResult, LLMChatWithToolsOptions, LLMResultWithTools } from './types'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export class GeminiClient implements LLMClient {
  async chat(options: LLMChatOptions): Promise<LLMResult> {
    const result = await this.chatWithTools(options)
    return result
  }

  async chatWithTools(options: LLMChatWithToolsOptions & { temperature?: number }): Promise<LLMResultWithTools> {
    if (!GEMINI_API_KEY) {
      return { text: '', error: 'חסר מפתח Gemini API' }
    }

    const { system, messages, enableWebSearch, maxTokens = 4096, tools: fnTools, temperature = 0.7 } = options

    // Map messages to Gemini wire format.
    //  - user text:        {role:'user',  parts:[{text}]}
    //  - assistant text:   {role:'model', parts:[{text}]}
    //  - assistant calls:  {role:'model', parts:[{functionCall:{name,args}}, ...]}
    //  - tool results:     {role:'user',  parts:[{functionResponse:{name,response:{result}}}, ...]}
    //    (Gemini uses role=user for function responses — there's no separate tool role.)
    const contents = messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          parts: m.toolResults.map(tr => ({
            functionResponse: { name: tr.name, response: { result: tr.result } },
          })),
        }
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const parts: Record<string, unknown>[] = []
        if (m.content) parts.push({ text: m.content })
        for (const tc of m.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.args } })
        }
        return { role: 'model', parts }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || '' }],
      }
    })

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature, maxOutputTokens: maxTokens },
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
        const finishReason = candidate?.finishReason
        const safetyRatings = candidate?.safetyRatings
        const blockedCategory = safetyRatings?.find((r: any) => r.blocked || r.probability === 'HIGH' || r.probability === 'MEDIUM')
        const promptFeedback = data?.promptFeedback
        const usage = data?.usageMetadata
        console.log('[LLM/Gemini] EMPTY response diagnostics:', JSON.stringify({
          finishReason,
          blockedCategory,
          safetyRatings,
          promptFeedback,
          usage,
        }))
        console.log('[LLM/Gemini] Full candidate:', JSON.stringify(candidate))
      }

      const thinking = parts.filter(p => p.thought && p.text).map(p => p.text).join('').trim()
      const text = parts.filter(p => !p.thought && p.text).map(p => p.text).join('') || ''
      const functionCalls = parts
        .filter(p => p.functionCall)
        .map(p => ({ name: p.functionCall.name as string, args: (p.functionCall.args || {}) as Record<string, unknown> }))

      console.log('[LLM/Gemini] parts:', parts.length, 'text:', text.length, 'functionCalls:', functionCalls.length,
        functionCalls.length ? functionCalls.map(fc => fc.name).join(',') : '')

      if (!text && !functionCalls.length) {
        const finishReason = candidate?.finishReason || 'UNKNOWN'
        return { text: '', error: `Gemini לא החזיר תשובה (finishReason=${finishReason})` }
      }

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
