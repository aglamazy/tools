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
}

export type LLMChatWithToolsOptions = LLMChatOptions & {
  tools?: FunctionDeclaration[]
}

export type LLMResultWithTools = LLMResult & {
  functionCalls?: LLMFunctionCall[]
}
