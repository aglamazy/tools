/**
 * Chat history store — multi-thread, Dexie-backed, syncs via the
 * encrypted backup pipeline (chats + chatMessages are registered in
 * SYNCED_DB_TABLES).
 *
 * Replaces the older single-thread localStorage design. The only
 * localStorage usage left here is the per-uid pointer to the last
 * active chat id — that is UI state, not content, so it stays local.
 *
 * Public API (see the inline JSDoc of each function):
 *   listChats / getChat / createChat / renameChat / deleteChat
 *   listMessages / appendMessage
 *   getActiveChatId / setActiveChatId
 *   migrateFromLocalStorageV1   (one-time, idempotent)
 */

import { db, type Chat, type ChatMessageRow } from '@/app/db/financeDB'

export type ChatSummary = Chat
export type ChatMessage = ChatMessageRow

const DEFAULT_CHAT_TITLE = 'שיחה חדשה'
const MIGRATED_PLACEHOLDER_TITLE = 'שיחה משוחזרת'
const MAX_TITLE_LEN = 40

const ACTIVE_CHAT_KEY_PREFIX = 'aglamazo_active_chat_v1_'
const LEGACY_HISTORY_KEY_PREFIX = 'aglamazo_chat_history_v1_'
const MIGRATION_MARKER_PREFIX = 'aglamazo_chat_history_v1_migrated_'

type LegacyMessage = {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
}

type LegacyState = {
  messages?: LegacyMessage[]
  pendingSelections?: unknown
}

function newId(): string {
  // crypto.randomUUID is available in browsers we target and in node 19+.
  return (globalThis.crypto?.randomUUID?.() as string)
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return DEFAULT_CHAT_TITLE
  return clean.length > MAX_TITLE_LEN ? clean.slice(0, MAX_TITLE_LEN) : clean
}

/** List the chats that belong to `uid`, newest-first. */
async function listChats(uid: string): Promise<ChatSummary[]> {
  try {
    const rows = await db.chats.where('uid').equals(uid).toArray()
    rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    return rows
  } catch (err) {
    console.error('[chatHistoryStore] listChats error:', err)
    return []
  }
}

/** Fetch one chat by id, scoped to uid (null when not found / not owned). */
async function getChat(uid: string, chatId: string): Promise<ChatSummary | null> {
  try {
    const row = await db.chats.get(chatId)
    if (!row || row.uid !== uid) return null
    return row
  } catch (err) {
    console.error('[chatHistoryStore] getChat error:', err)
    return null
  }
}

/** Create an empty chat for `uid`. Title defaults to "שיחה חדשה". */
async function createChat(uid: string, title?: string): Promise<ChatSummary> {
  const now = new Date().toISOString()
  const row: Chat = {
    id: newId(),
    uid,
    title: title?.trim() || DEFAULT_CHAT_TITLE,
    createdAt: now,
    updatedAt: now,
    msgCount: 0,
  }
  await db.chats.put(row)
  emitChanges(uid)
  return row
}

/** Rename a chat (no-op if chat doesn't belong to uid). */
async function renameChat(uid: string, chatId: string, title: string): Promise<void> {
  const existing = await getChat(uid, chatId)
  if (!existing) return
  await db.chats.update(chatId, {
    title: title.trim() || DEFAULT_CHAT_TITLE,
    updatedAt: new Date().toISOString(),
  })
  emitChanges(uid)
}

/** Delete a chat and all its messages. Safe when chat doesn't belong to uid. */
async function deleteChat(uid: string, chatId: string): Promise<void> {
  const existing = await getChat(uid, chatId)
  if (!existing) return
  const msgIds = await db.chatMessages.where('chatId').equals(chatId).primaryKeys()
  await db.transaction('rw', db.chats, db.chatMessages, async () => {
    if (msgIds.length > 0) await db.chatMessages.bulkDelete(msgIds as string[])
    await db.chats.delete(chatId)
  })
  // Clear the active-chat pointer if it pointed at the deleted chat.
  if (getActiveChatId(uid) === chatId) {
    try {
      localStorage.removeItem(ACTIVE_CHAT_KEY_PREFIX + uid)
    } catch {
      // ignore
    }
    emitActive(uid, null)
  }
  emitChanges(uid)
}

/** Messages for a chat ordered by createdAt ascending. */
async function listMessages(uid: string, chatId: string): Promise<ChatMessage[]> {
  try {
    const rows = await db.chatMessages.where('chatId').equals(chatId).toArray()
    // Scope to uid in case of stale rows from a different auth user.
    const mine = rows.filter(r => r.uid === uid)
    mine.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    return mine
  } catch (err) {
    console.error('[chatHistoryStore] listMessages error:', err)
    return []
  }
}

/**
 * Append a message to a chat. Touches chat.updatedAt, increments msgCount,
 * and auto-fills chat.title from the first user message when the title is
 * still the default placeholder.
 */
async function appendMessage(
  uid: string,
  chatId: string,
  msg: { role: 'user' | 'assistant'; content: string; thinking?: string },
): Promise<void> {
  const chat = await getChat(uid, chatId)
  if (!chat) {
    console.warn('[chatHistoryStore] appendMessage: chat not found', chatId)
    return
  }
  const now = new Date().toISOString()
  const row: ChatMessageRow = {
    id: newId(),
    chatId,
    uid,
    role: msg.role,
    content: msg.content,
    thinking: msg.thinking,
    createdAt: now,
  }
  const titleUpdate =
    chat.title === DEFAULT_CHAT_TITLE && msg.role === 'user'
      ? { title: deriveTitle(msg.content) }
      : {}
  await db.transaction('rw', db.chats, db.chatMessages, async () => {
    await db.chatMessages.put(row)
    await db.chats.update(chatId, {
      ...titleUpdate,
      updatedAt: now,
      msgCount: (chat.msgCount || 0) + 1,
    })
  })
  emitChanges(uid)
}

// Pub-sub so the widget header and the chat body can stay in sync when
// either side mutates chats (create/rename/delete) or switches the active
// chat. Subscribers receive the new active chat id for the given uid.
type ActiveListener = (uid: string, activeChatId: string | null) => void
type ChangeListener = (uid: string) => void
const activeListeners = new Set<ActiveListener>()
const changeListeners = new Set<ChangeListener>()

function subscribeActive(fn: ActiveListener): () => void {
  activeListeners.add(fn)
  return () => { activeListeners.delete(fn) }
}
function subscribeChanges(fn: ChangeListener): () => void {
  changeListeners.add(fn)
  return () => { changeListeners.delete(fn) }
}
function emitActive(uid: string, activeChatId: string | null): void {
  activeListeners.forEach(l => l(uid, activeChatId))
}
function emitChanges(uid: string): void {
  changeListeners.forEach(l => l(uid))
}

/** Save the "last selected" chat pointer for uid (UI state only). */
function setActiveChatId(uid: string, chatId: string): void {
  try {
    localStorage.setItem(ACTIVE_CHAT_KEY_PREFIX + uid, chatId)
  } catch {
    // Storage disabled — the UI will create/pick a chat again on reload.
  }
  emitActive(uid, chatId)
}

/** Read the "last selected" chat pointer for uid. */
function getActiveChatId(uid: string): string | null {
  try {
    return localStorage.getItem(ACTIVE_CHAT_KEY_PREFIX + uid)
  } catch {
    return null
  }
}

/**
 * One-time migration from the old single-thread localStorage key
 * (`aglamazo_chat_history_v1_{uid}`) to a Dexie-backed chat. Idempotent:
 * a per-uid marker ensures we never import twice. Returns the new chatId
 * when a migration actually happened, or null when there was nothing to
 * migrate (or it already ran).
 */
async function migrateFromLocalStorageV1(uid: string): Promise<string | null> {
  const markerKey = MIGRATION_MARKER_PREFIX + uid
  const legacyKey = LEGACY_HISTORY_KEY_PREFIX + uid

  let alreadyMigrated = false
  try {
    alreadyMigrated = !!localStorage.getItem(markerKey)
  } catch {
    alreadyMigrated = false
  }
  if (alreadyMigrated) return null

  let raw: string | null = null
  try {
    raw = localStorage.getItem(legacyKey)
  } catch {
    raw = null
  }

  if (!raw) {
    try {
      localStorage.setItem(markerKey, new Date().toISOString())
    } catch {
      // ignore
    }
    return null
  }

  let parsed: LegacyState | null = null
  try {
    parsed = JSON.parse(raw) as LegacyState
  } catch {
    parsed = null
  }

  const messages = Array.isArray(parsed?.messages) ? parsed!.messages! : []
  if (messages.length === 0) {
    // Nothing useful to import — just wipe the legacy key and mark done.
    try {
      localStorage.removeItem(legacyKey)
      localStorage.setItem(markerKey, new Date().toISOString())
    } catch {
      // ignore
    }
    return null
  }

  const firstUser = messages.find(m => m.role === 'user')
  const chatTitle = firstUser ? deriveTitle(firstUser.content) : MIGRATED_PLACEHOLDER_TITLE
  const chat = await createChat(uid, chatTitle)

  // Spread timestamps backwards one minute apart so ordering is stable
  // even though the original messages carried no timestamps.
  const nowMs = Date.now()
  const oneMinute = 60 * 1000
  const rows: ChatMessageRow[] = messages.map((m, i) => ({
    id: newId(),
    chatId: chat.id,
    uid,
    role: m.role,
    content: m.content,
    thinking: m.thinking,
    createdAt: new Date(nowMs - (messages.length - 1 - i) * oneMinute).toISOString(),
  }))

  await db.transaction('rw', db.chats, db.chatMessages, async () => {
    if (rows.length > 0) await db.chatMessages.bulkPut(rows)
    await db.chats.update(chat.id, {
      msgCount: rows.length,
      updatedAt: rows[rows.length - 1].createdAt,
    })
  })

  setActiveChatId(uid, chat.id)

  try {
    localStorage.removeItem(legacyKey)
    localStorage.setItem(markerKey, new Date().toISOString())
  } catch {
    // ignore
  }

  return chat.id
}

export const chatHistoryStore = {
  listChats,
  getChat,
  createChat,
  renameChat,
  deleteChat,
  listMessages,
  appendMessage,
  setActiveChatId,
  getActiveChatId,
  migrateFromLocalStorageV1,
  subscribeActive,
  subscribeChanges,
}
