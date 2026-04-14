export type LLMProvider = 'gemini' | 'anthropic'

export type LLMMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type LLMChatOptions = {
  system: string
  messages: LLMMessage[]
  enableWebSearch?: boolean
  maxTokens?: number
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
