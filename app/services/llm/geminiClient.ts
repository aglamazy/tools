import type { LLMClient, LLMChatOptions, LLMResult } from './types'

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export class GeminiClient implements LLMClient {
  async chat(options: LLMChatOptions): Promise<LLMResult> {
    if (!GEMINI_API_KEY) {
      return { text: '', error: 'חסר מפתח Gemini API' }
    }

    const { system, messages, enableWebSearch, maxTokens = 4096 } = options

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

    if (enableWebSearch) {
      body.tools = [{ googleSearch: {} }]
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
        if (response.status === 400) return { text: '', error: 'מפתח API לא תקין' }
        return { text: '', error: 'שגיאה בקריאה ל-Gemini' }
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('') || ''

      if (!text) return { text: '', error: 'Gemini לא החזיר תשובה' }
      return { text }
    } catch (err: any) {
      console.error('[LLM/Gemini] Error:', err)
      return { text: '', error: 'שגיאת רשת בקריאה ל-Gemini' }
    }
  }
}
