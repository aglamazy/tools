import type { SearchStrategy, SearchStrategyId } from './types'
import { createLlmWebSearchExecutor } from './executors/llmWebSearch'

export const strategies: Record<SearchStrategyId, SearchStrategy> = {
  'gemini-web': {
    id: 'gemini-web',
    label: 'Gemini + Web Search',
    subtitle: 'Gemini עם חיפוש אינטרנט',
    requiresUserKey: false,
    execute: createLlmWebSearchExecutor('gemini'),
  },
  'claude-web': {
    id: 'claude-web',
    label: 'Claude + Web Search',
    subtitle: 'Claude עם חיפוש אינטרנט',
    requiresUserKey: true,
    execute: createLlmWebSearchExecutor('anthropic'),
  },
}

export const strategyList = Object.values(strategies)
export const strategyIds = Object.keys(strategies) as SearchStrategyId[]
