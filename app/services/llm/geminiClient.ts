import type { LLMClient, LLMChatOptions, LLMResult, LLMChatWithToolsOptions, LLMResultWithTools } from './types'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

/**
 * Default model: the `-latest` alias auto-tracks the freshest stable Flash
 * revision. Cheaper and faster than pinning a specific version, and Google
 * usually rolls reliability fixes (including tool-use regression patches)
 * into the alias before they hit a pinned id. The chat brain can override
 * this per-call via `modelOverride` when it needs to escalate to a heavier
 * model (e.g. when the default jams and returns tool-call pseudocode as text).
 */
const DEFAULT_MODEL = 'gemini-flash-latest'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export class GeminiClient implements LLMClient {
  async chat(options: LLMChatOptions): Promise<LLMResult> {
    const result = await this.chatWithTools(options)
    return result
  }

  async chatWithTools(options: LLMChatWithToolsOptions & { temperature?: number }): Promise<LLMResultWithTools> {
    if (!GEMINI_API_KEY) {
      return { text: '', error: 'חסר מפתח Gemini API' }
    }

    const { system, messages, enableWebSearch, maxTokens = 4096, tools: fnTools, temperature = 0.7, modelOverride } = options
    const model = modelOverride || DEFAULT_MODEL
    const geminiUrl = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`

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
          // Echo back thoughtSignature when we have one — required by
          // gemini-flash-latest and 3.x; harmless on older models.
          const part: Record<string, unknown> = {
            functionCall: { name: tc.name, args: tc.args },
          }
          if (tc.thoughtSignature) part.thoughtSignature = tc.thoughtSignature
          parts.push(part)
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
      const response = await fetch(`${geminiUrl}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error(`[LLM/Gemini:${model}] Error:`, response.status, errorBody)
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
        .map(p => ({
          name: p.functionCall.name as string,
          args: (p.functionCall.args || {}) as Record<string, unknown>,
          // Capture thoughtSignature if Gemini emitted one alongside the call.
          // It lives on the part itself (sibling of functionCall), not inside.
          ...(typeof p.thoughtSignature === 'string' ? { thoughtSignature: p.thoughtSignature } : {}),
        }))

      console.log(`[LLM/Gemini:${model}] parts:`, parts.length, 'text:', text.length, 'functionCalls:', functionCalls.length,
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
