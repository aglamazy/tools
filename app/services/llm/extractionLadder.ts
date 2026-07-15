import { parseClaudeJson } from '@/app/utils/parseClaudeJson'

export type ExtractionTextPart = {
  type: 'text'
  text: string
}

export type ExtractionPdfPart = {
  type: 'document'
  data: string
}

export type ExtractionImagePart = {
  type: 'image'
  data: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | string
}

export type ExtractionInputPart = ExtractionTextPart | ExtractionPdfPart | ExtractionImagePart

export type ExtractionSuccess<T> = {
  ok: true
  provider: 'gemini' | 'anthropic'
  text: string
  data: T
  fellBack: boolean
}

export type ExtractionFailure = {
  ok: false
  provider?: 'gemini' | 'anthropic'
  error: string
  details?: string
  raw?: string
  status?: number
  providerError?: true
  fellBack: boolean
}

export type ExtractionResult<T> = ExtractionSuccess<T> | ExtractionFailure

export type ExtractionLadderOptions<T> = {
  routeName: string
  systemPrompt: string
  userParts: ExtractionInputPart[]
  parse?: (text: string) => T
  validate?: (data: T) => string | null | undefined
  geminiModel?: string
  geminiMaxTokens?: number
  geminiTemperature?: number
  geminiResponseSchema?: Record<string, unknown>
  anthropicModel?: string
  anthropicMaxTokens?: number
  anthropicTemperature?: number
  anthropicApiKey?: string
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5'

export async function extractJsonWithFallback<T>(options: ExtractionLadderOptions<T>): Promise<ExtractionResult<T>> {
  const parse = options.parse ?? parseClaudeJson<T>
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  const anthropicKey = options.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim()

  const geminiAttempt = await tryGemini<T>({
    routeName: options.routeName,
    systemPrompt: options.systemPrompt,
    userParts: options.userParts,
    parse,
    validate: options.validate,
    apiKey: geminiKey,
    model: options.geminiModel ?? DEFAULT_GEMINI_MODEL,
    maxTokens: options.geminiMaxTokens ?? 4096,
    temperature: options.geminiTemperature ?? 0,
    responseSchema: options.geminiResponseSchema,
  })
  if (geminiAttempt.ok) {
    return geminiAttempt
  }

  if (!anthropicKey) {
    return geminiAttempt
  }

  const anthropicAttempt = await tryAnthropic<T>({
    routeName: options.routeName,
    systemPrompt: options.systemPrompt,
    userParts: options.userParts,
    parse,
    validate: options.validate,
    apiKey: anthropicKey,
    model: options.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL,
    maxTokens: options.anthropicMaxTokens ?? options.geminiMaxTokens ?? 4096,
    temperature: options.anthropicTemperature ?? options.geminiTemperature ?? 0,
  })
  if (anthropicAttempt.ok) {
    return {
      ...anthropicAttempt,
      fellBack: true,
    }
  }

  const anthropicFailure = anthropicAttempt as ExtractionFailure
  const geminiFailure = geminiAttempt as ExtractionFailure
  return {
    ok: false,
    provider: anthropicFailure.provider ?? geminiFailure.provider,
    error: anthropicFailure.error || geminiFailure.error,
    details: anthropicFailure.details || geminiFailure.details,
    raw: anthropicFailure.raw || geminiFailure.raw,
    status: anthropicFailure.status ?? geminiFailure.status,
    providerError: anthropicFailure.providerError || geminiFailure.providerError,
    fellBack: true,
  }
}

async function tryGemini<T>(options: {
  routeName: string
  systemPrompt: string
  userParts: ExtractionInputPart[]
  parse: (text: string) => T
  validate?: (data: T) => string | null | undefined
  apiKey?: string
  model: string
  maxTokens: number
  temperature: number
  responseSchema?: Record<string, unknown>
}): Promise<ExtractionResult<T>> {
  if (!options.apiKey) {
    return {
      ok: false,
      provider: 'gemini',
      error: 'Missing Gemini API key',
      providerError: true,
      status: 400,
      fellBack: false,
    }
  }

  const contents = [{
    role: 'user',
    parts: options.userParts.map(mapGeminiPart),
  }]

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature,
    maxOutputTokens: options.maxTokens,
  }
  if (options.responseSchema) {
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseSchema = options.responseSchema
  }

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: options.systemPrompt }] },
    contents,
    generationConfig,
  }

  try {
    const response = await fetch(
      `${GEMINI_BASE}/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[${options.routeName}] Gemini API error:`, response.status, errorBody)
      return {
        ok: false,
        provider: 'gemini',
        error: geminiErrorMessage(response.status),
        details: errorBody.slice(0, 800),
        status: response.status,
        providerError: true,
        fellBack: false,
      }
    }

    const data = await response.json()
    const parts: Array<{ text?: string }> = data.candidates?.[0]?.content?.parts || []
    const text = parts.map((p) => p.text ?? '').join('').trim()
    if (!text) {
      return {
        ok: false,
        provider: 'gemini',
        error: 'Gemini did not return JSON text',
        details: data.candidates?.[0]?.finishReason ? `finishReason=${data.candidates[0].finishReason}` : undefined,
        raw: JSON.stringify(data).slice(0, 2000),
        providerError: true,
        fellBack: false,
      }
    }

    let parsed: T
    try {
      parsed = options.parse(text)
    } catch (parseErr) {
      return {
        ok: false,
        provider: 'gemini',
        error: 'Failed to parse Gemini response as JSON',
        details: parseErr instanceof Error ? parseErr.message : String(parseErr),
        raw: text,
        providerError: true,
        fellBack: false,
      }
    }

    const validationError = options.validate?.(parsed)
    if (validationError) {
      return {
        ok: false,
        provider: 'gemini',
        error: validationError,
        raw: text,
        providerError: true,
        fellBack: false,
      }
    }

    return {
      ok: true,
      provider: 'gemini',
      text,
      data: parsed,
      fellBack: false,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${options.routeName}] Gemini network error:`, err)
    return {
      ok: false,
      provider: 'gemini',
      error: `Gemini network error: ${message}`,
      details: message,
      providerError: true,
      fellBack: false,
    }
  }
}

async function tryAnthropic<T>(options: {
  routeName: string
  systemPrompt: string
  userParts: ExtractionInputPart[]
  parse: (text: string) => T
  validate?: (data: T) => string | null | undefined
  apiKey?: string
  model: string
  maxTokens: number
  temperature: number
}): Promise<ExtractionResult<T>> {
  if (!options.apiKey) {
    return {
      ok: false,
      provider: 'anthropic',
      error: 'Missing Anthropic API key',
      providerError: true,
      status: 400,
      fellBack: true,
    }
  }

  const content = options.userParts.map(mapAnthropicPart)
  const hasPdf = options.userParts.some((part) => part.type === 'document')

  const body: Record<string, unknown> = {
    model: options.model,
    max_tokens: options.maxTokens,
    system: options.systemPrompt,
    messages: [{
      role: 'user',
      content,
    }],
  }
  if (options.temperature != null) {
    body.temperature = options.temperature
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
        ...(hasPdf ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[${options.routeName}] Claude API error:`, response.status, errorBody)
      return {
        ok: false,
        provider: 'anthropic',
        error: anthropicErrorMessage(response.status, errorBody),
        details: errorBody.slice(0, 800),
        status: response.status,
        providerError: true,
        fellBack: true,
      }
    }

    const data = await response.json()
    const textBlock = Array.isArray(data.content) ? data.content.find((c: any) => c?.type === 'text') : undefined
    const text = textBlock?.text?.trim() ?? ''
    if (!text) {
      return {
        ok: false,
        provider: 'anthropic',
        error: 'Claude did not return JSON text',
        raw: JSON.stringify(data).slice(0, 2000),
        providerError: true,
        fellBack: true,
      }
    }

    let parsed: T
    try {
      parsed = options.parse(text)
    } catch (parseErr) {
      return {
        ok: false,
        provider: 'anthropic',
        error: 'Failed to parse Claude response as JSON',
        details: parseErr instanceof Error ? parseErr.message : String(parseErr),
        raw: text,
        providerError: true,
        fellBack: true,
      }
    }

    const validationError = options.validate?.(parsed)
    if (validationError) {
      return {
        ok: false,
        provider: 'anthropic',
        error: validationError,
        raw: text,
        providerError: true,
        fellBack: true,
      }
    }

    return {
      ok: true,
      provider: 'anthropic',
      text,
      data: parsed,
      fellBack: true,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${options.routeName}] Claude network error:`, err)
    return {
      ok: false,
      provider: 'anthropic',
      error: `Claude network error: ${message}`,
      details: message,
      providerError: true,
      fellBack: true,
    }
  }
}

function mapGeminiPart(part: ExtractionInputPart): Record<string, unknown> {
  if (part.type === 'text') {
    return { text: part.text }
  }
  return {
    inlineData: {
      mimeType: part.type === 'document' ? 'application/pdf' : part.mimeType,
      data: part.data,
    },
  }
}

function mapAnthropicPart(part: ExtractionInputPart): Record<string, unknown> {
  if (part.type === 'text') {
    return { type: 'text', text: part.text }
  }
  if (part.type === 'document') {
    return {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: part.data,
      },
    }
  }
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: part.mimeType,
      data: part.data,
    },
  }
}

function geminiErrorMessage(status: number): string {
  if (status === 429) return 'Gemini rate limit exceeded'
  if (status === 401) return 'Invalid Gemini API key'
  if (status === 400) return `Gemini API error: ${status}`
  return `Gemini API error: ${status}`
}

function anthropicErrorMessage(status: number, errorBody: string): string {
  let providerMsg = ''
  try {
    providerMsg = JSON.parse(errorBody)?.error?.message || ''
  } catch {
    providerMsg = ''
  }

  if (/credit balance is too low/i.test(providerMsg)) {
    return 'Anthropic credit balance is too low'
  }
  if (status === 401) return 'Invalid Anthropic API key'
  if (status === 429) return 'Anthropic rate limit exceeded'
  if (providerMsg) return providerMsg
  return `Claude API error: ${status}`
}
