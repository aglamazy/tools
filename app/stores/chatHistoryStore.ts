/**
 * Chat history store — device-only persistence for the web chat widget.
 *
 * This is phase A of the three-tier persistence model (see task #27):
 *   1. localStorage (here) — device-only, default ON, platform-blind at rest.
 *   2. Firestore opt-in   — phase B, cross-device, admin-readable.
 *   3. Telegram            — external channel, handles "archive forever".
 *
 * Keyed by uid so a shared browser doesn't leak threads between users.
 * Capped at MAX_PERSISTED_MESSAGES so a long-running thread never blows the
 * localStorage quota.
 */

const HISTORY_KEY_PREFIX = 'aglamazo_chat_history_v1_'
const MAX_PERSISTED_MESSAGES = 80

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
}

export type ChatProductResult = {
  catalogId: string
  name: string
  brand: string
  price: string
  unitPrice: string
}

export type ChatPendingSelection = {
  query: string
  qty: number
  target: 'pending' | 'standing'
  store?: string
  searchKey: string
  results: ChatProductResult[]
}

export type PersistedChatState = {
  messages: ChatMessage[]
  pendingSelections: ChatPendingSelection[]
}

export const chatHistoryStore = {
  load(uid: string): PersistedChatState | null {
    try {
      const raw = localStorage.getItem(HISTORY_KEY_PREFIX + uid)
      if (!raw) return null
      const parsed = JSON.parse(raw) as PersistedChatState
      if (!parsed || !Array.isArray(parsed.messages)) return null
      return {
        messages: parsed.messages,
        pendingSelections: Array.isArray(parsed.pendingSelections) ? parsed.pendingSelections : [],
      }
    } catch {
      return null
    }
  },

  save(uid: string, state: PersistedChatState): void {
    try {
      const tail = state.messages.slice(-MAX_PERSISTED_MESSAGES)
      const payload: PersistedChatState = {
        messages: tail,
        pendingSelections: state.pendingSelections,
      }
      localStorage.setItem(HISTORY_KEY_PREFIX + uid, JSON.stringify(payload))
    } catch {
      // Quota exceeded or storage disabled — fail silently, state remains in memory.
    }
  },

  clear(uid: string): void {
    try {
      localStorage.removeItem(HISTORY_KEY_PREFIX + uid)
    } catch {
      // ignore
    }
  },
}
