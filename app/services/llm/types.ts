export type LLMProvider = 'gemini' | 'anthropic'

/**
 * A single turn sent to or received from the LLM. Three shapes:
 * - User text
 * - Assistant text (optional) + optional tool calls (when the model decided to call tools)
 * - Tool results (results of the tools the assistant called), fed back for the next model turn
 */
export type LLMMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; toolCalls?: LLMFunctionCall[] }
  | { role: 'tool'; toolResults: LLMToolResult[] }

export type LLMToolResult = {
  name: string
  result: unknown
}

export type LLMChatOptions = {
  system: string
  messages: LLMMessage[]
  enableWebSearch?: boolean
  maxTokens?: number
  temperature?: number
  apiKey?: string
  /**
   * Optional model override. When set, the client uses this model id for THIS
   * call only (the underlying client instance keeps its default). Used by the
   * chat brain to escalate to a more reliable model when the default model
   * "jams" — returns tool-call pseudocode as text instead of structured
   * functionCalls. See chatProcessor.ts ESCALATION_MODEL.
   */
  modelOverride?: string
}

export type GroundingSource = {
  url: string
  title?: string
}

export type LLMResult = {
  text: string
  thinking?: string
  error?: string
  groundingSources?: GroundingSource[]
}

export interface LLMClient {
  chat(options: LLMChatOptions): Promise<LLMResult>
}

// --- Function calling types ---

export type FunctionDeclaration = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export type LLMFunctionCall = {
  name: string
  args: Record<string, unknown>
  /**
   * Gemini thought-signature. Modern Gemini models (3.x, flash-latest with
   * thinking on) emit this on every functionCall part and REQUIRE it back
   * when the same call is echoed in the next turn's history. Missing it
   * results in HTTP 400 "Function call is missing a thought_signature".
   * Older pinned `gemini-2.5-flash` was lenient. Treat as opaque base64.
   */
  thoughtSignature?: string
}

export type LLMChatWithToolsOptions = LLMChatOptions & {
  tools?: FunctionDeclaration[]
}

export type LLMResultWithTools = LLMResult & {
  functionCalls?: LLMFunctionCall[]
}
