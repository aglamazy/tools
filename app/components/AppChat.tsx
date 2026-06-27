'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import { getIdToken } from '@/app/services/firebaseAuthService'
import { subscribeToAuth } from '@/app/stores/authStore'
import { chatHistoryStore, type ChatMessage } from '@/app/stores/chatHistoryStore'

type Message = { role: 'user' | 'assistant'; content: string; thinking?: string }

type ProductResult = {
  catalogId: string
  name: string
  brand: string
  price: string
  unitPrice: string
}

type PendingSelection = {
  query: string
  qty: number
  target: 'pending' | 'standing'
  store?: string
  searchKey: string
  results: ProductResult[]
}

function ThinkingBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const preview = text.slice(0, 80).replace(/\n/g, ' ') + (text.length > 80 ? '…' : '')
  return (
    <div className="app-chat-thinking">
      <button className="app-chat-thinking-toggle" onClick={() => setOpen(o => !o)}>
        <span className="app-chat-thinking-icon">💭</span>
        <span className="app-chat-thinking-preview">{open ? 'מחשבה' : preview}</span>
        <span className="app-chat-thinking-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="app-chat-thinking-body">{text}</div>}
    </div>
  )
}

function toUIMessage(row: ChatMessage): Message {
  return { role: row.role, content: row.content, thinking: row.thinking }
}

/**
 * Backoff schedule (seconds) for client-side retry when /api/chat returns
 * 503/retryable. Mirrors the server-side cron schedule in chatQueue.ts so
 * the user-felt cadence is the same on both surfaces. Total ≈ 67 minutes.
 */
const RETRY_BACKOFF_SECONDS = [30, 60, 120, 300, 600, 1200, 1800]

/**
 * Stable per-tab anonymous identity. Used as both the chatHistoryStore key
 * and the value of the X-Anon-Session header sent to /api/chat. Persists
 * across reloads in the same tab via sessionStorage; new tab → new id.
 */
const ANON_PREFIX = 'anon:'
const ANON_KEY = 'saliko_anon_chat_uid'
function getOrCreateAnonUid(): string {
  if (typeof window === 'undefined') return `${ANON_PREFIX}ssr`
  let id = sessionStorage.getItem(ANON_KEY)
  if (!id) {
    const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    id = `${ANON_PREFIX}${rand}`
    try { sessionStorage.setItem(ANON_KEY, id) } catch { /* private mode */ }
  }
  return id
}

/**
 * Tier-1 anon credential state — kept in sessionStorage so it's wiped on
 * tab close. The server is stateless about this; we round-trip it on every
 * /api/chat call. Shape mirrors `AnonStoreCreds` in actionExecutor.ts —
 * keeping the types in lockstep is a load-bearing assumption of the wire
 * contract. Browser-only (no SSR access).
 */
type AnonStoreCreds = { storeId: string; phone: string; token?: string; orderedOnce?: boolean }
const ANON_CREDS_KEY = 'saliko.anonStoreCreds'

function readAnonStoreCreds(): AnonStoreCreds | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(ANON_CREDS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AnonStoreCreds>
    if (!parsed || typeof parsed.storeId !== 'string' || typeof parsed.phone !== 'string') return null
    return {
      storeId: parsed.storeId,
      phone: parsed.phone,
      ...(typeof parsed.token === 'string' && parsed.token ? { token: parsed.token } : {}),
      ...(parsed.orderedOnce === true ? { orderedOnce: true } : {}),
    }
  } catch {
    return null
  }
}

function writeAnonStoreCreds(next: AnonStoreCreds | null): void {
  if (typeof window === 'undefined') return
  try {
    if (next === null) {
      sessionStorage.removeItem(ANON_CREDS_KEY)
    } else {
      sessionStorage.setItem(ANON_CREDS_KEY, JSON.stringify(next))
    }
  } catch { /* private mode / quota */ }
}

function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds} שניות`
  const min = Math.round(seconds / 60)
  return `${min} דקות`
}

/** AbortController-friendly sleep that rejects on `AbortError`. */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort)
  })
}

export default function AppChat() {
  const { showToast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [pendingSelections, setPendingSelections] = useState<PendingSelection[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [retryStatus, setRetryStatus] = useState<{ attempt: number; total: number; nextDelaySec: number } | null>(null)
  const [selectingKey, setSelectingKey] = useState<string | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  /**
   * Tracks the in-flight retry sequence. `abort()` is called when the user
   * sends a new message or unmounts the chat — without this, the polling
   * loop would keep firing fetches even after the user gave up on the prior
   * message (and would also race the new message's own retry sequence).
   */
  const retryControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingSelections])

  // Soft-reset: clear current product pickers when the "התחל מחדש" button fires.
  useEffect(() => {
    const onSoftReset = () => setPendingSelections([])
    window.addEventListener('chat:soft-reset', onSoftReset)
    return () => window.removeEventListener('chat:soft-reset', onSoftReset)
  }, [])

  // Hydrate from Dexie once we know who the user is. We only migrate + pick
  // an active chat once per auth user per mount. Visitor mode: when no user,
  // use a stable per-tab anon id so chatHistoryStore + the /api/chat backend
  // can both key off it. Saliko's chat is open to visitors — only tools
  // that need a real account fail gracefully on the server.
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async ({ user, initialized }) => {
      if (!initialized) return
      const effectiveUid = user?.uid ?? getOrCreateAnonUid()
      if (uid === effectiveUid) return // already hydrated

      setUid(effectiveUid)
      if (user) {
        // One-time migration from the old single-thread localStorage key.
        await chatHistoryStore.migrateFromLocalStorageV1(user.uid)
        // Logging in: any leftover anon Tier-1 cred is stale and would also
        // be ignored by the server (anon creds only apply to anon: uids).
        // Wipe defensively so subsequent tab reloads don't surface it.
        writeAnonStoreCreds(null)
      }

      let chatId = chatHistoryStore.getActiveChatId(effectiveUid)
      if (chatId) {
        const chat = await chatHistoryStore.getChat(effectiveUid, chatId)
        if (!chat) chatId = null
      }
      if (!chatId) {
        const chats = await chatHistoryStore.listChats(effectiveUid)
        if (chats.length > 0) {
          chatId = chats[0].id
          chatHistoryStore.setActiveChatId(effectiveUid, chatId)
        } else {
          const fresh = await chatHistoryStore.createChat(effectiveUid)
          chatId = fresh.id
          chatHistoryStore.setActiveChatId(effectiveUid, chatId)
        }
      }
      setActiveChatId(chatId)

      const rows = await chatHistoryStore.listMessages(effectiveUid, chatId)
      setMessages(rows.map(toUIMessage))
      setPendingSelections([])
    })
    return () => unsubscribe()
  }, [uid])

  // React to active-chat changes driven by the header dropdown (new chat,
  // switch chat, or delete-of-current). The store is the single source of
  // truth; we just re-read when it tells us to.
  useEffect(() => {
    if (!uid) return
    const unsub = chatHistoryStore.subscribeActive(async (listenerUid, nextId) => {
      if (listenerUid !== uid) return
      if (!nextId) {
        // Active chat got cleared (e.g. its chat was deleted). Pick the
        // next-newest or create a fresh one.
        const chats = await chatHistoryStore.listChats(uid)
        let targetId: string
        if (chats.length > 0) {
          targetId = chats[0].id
        } else {
          const fresh = await chatHistoryStore.createChat(uid)
          targetId = fresh.id
        }
        chatHistoryStore.setActiveChatId(uid, targetId)
        return
      }
      setActiveChatId(nextId)
      const rows = await chatHistoryStore.listMessages(uid, nextId)
      setMessages(rows.map(toUIMessage))
      setPendingSelections([])
      // New / switched chat = fresh anon Tier-1 session: wipe the cred so
      // OTP starts from scratch. Without this, a user who switches chats
      // mid-OTP would carry stale `{storeId, phone, token}` state into the
      // new conversation.
      if (uid.startsWith(ANON_PREFIX)) writeAnonStoreCreds(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    })
    return unsub
  }, [uid])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || !uid || !activeChatId) return

    // Cancel any prior retry sequence — sending a new message implicitly
    // abandons the previous one. The user has moved on.
    if (retryControllerRef.current) {
      retryControllerRef.current.abort()
      retryControllerRef.current = null
    }

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setRetryStatus(null)
    setPendingSelections([])

    const controller = new AbortController()
    retryControllerRef.current = controller

    // We persist the user message to local Dexie immediately so it survives
    // a refresh, but we ONLY persist the assistant reply on success — a 503
    // means the server didn't persist either, and we shouldn't bake a fake
    // assistant message into local history that the next retry can't see.
    try {
      await chatHistoryStore.appendMessage(uid, activeChatId, userMsg)

      const totalAttempts = 1 + RETRY_BACKOFF_SECONDS.length
      let attempt = 0

      while (attempt < totalAttempts) {
        attempt += 1

        if (controller.signal.aborted) return

        let response: Response
        let data: {
          success?: boolean
          retryable?: boolean
          reply?: string
          thinking?: string
          error?: string
          pendingSelections?: PendingSelection[]
          /** Server-side update to Tier-1 anon creds. Present only when changed. `null` = wipe. */
          anonStoreCreds?: AnonStoreCreds | null
        }
        try {
          const token = await getIdToken()
          // Anon visitor: send the per-tab session id so the server can key
          // chat history (in chatBrain it short-circuits to no-Firestore mode)
          // and tools that need a real account return their auth-required
          // fallback instead of crashing on missing creds.
          const isAnon = uid.startsWith(ANON_PREFIX)
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (token) headers['Authorization'] = `Bearer ${token}`
          if (isAnon) headers['x-anon-session'] = uid.slice(ANON_PREFIX.length)
          // Anon visitors have no Firestore-backed thread, so we re-send the
          // recent messages with each request to preserve cross-turn context.
          // Cap to ~20 turns; older content rolls off (matches server cap).
          const requestBody: {
            message: string
            history?: { role: 'user' | 'assistant'; content: string }[]
            anonStoreCreds?: AnonStoreCreds | null
          } = { message: text }
          if (isAnon) {
            const recent = messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
            requestBody.history = recent
            // Round-trip Tier-1 cred state out of sessionStorage on every
            // request. Server reads it in-memory, may update, and ships back
            // the new state on the response (which we write below).
            const creds = readAnonStoreCreds()
            if (creds) requestBody.anonStoreCreds = creds
          }
          response = await fetch('/api/chat', {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          })
          data = await response.json()
        } catch (err) {
          if (controller.signal.aborted) return
          // Network errors are also retryable on the same backoff schedule.
          console.warn('[AppChat] fetch failed, treating as retryable:', err)
          data = { success: false, retryable: true, error: 'network' }
          response = new Response(null, { status: 503 })
        }

        if (data.success) {
          const assistantMsg: Message = { role: 'assistant', content: data.reply || '', thinking: data.thinking }
          setMessages(prev => [...prev, assistantMsg])
          await chatHistoryStore.appendMessage(uid, activeChatId, assistantMsg)
          if (data.pendingSelections?.length) {
            setPendingSelections(data.pendingSelections)
          }
          // Persist Tier-1 anon cred updates to sessionStorage. Server omits
          // the key when nothing changed; sends null to explicitly wipe.
          if (Object.prototype.hasOwnProperty.call(data, 'anonStoreCreds')) {
            writeAnonStoreCreds(data.anonStoreCreds ?? null)
          }
          setRetryStatus(null)
          return
        }

        // Non-retryable server error (auth, 400, 500). Surface and stop.
        if (!data.retryable) {
          showToast('error', data.error || 'שגיאה בשליחת ההודעה')
          return
        }

        // Out of retry budget — give up with a Hebrew assistant message.
        // The admin panic was already fired by the server on first exhaust;
        // the client deliberately does NOT call panic itself.
        const backoffIdx = attempt - 1
        if (backoffIdx >= RETRY_BACKOFF_SECONDS.length) {
          const giveUp: Message = {
            role: 'assistant',
            content: '⚠️ מערכת התקשורת לא מגיבה. הודענו לאדמין — נסה שוב מאוחר יותר.',
          }
          setMessages(prev => [...prev, giveUp])
          await chatHistoryStore.appendMessage(uid, activeChatId, giveUp)
          setRetryStatus(null)
          return
        }

        const delaySec = RETRY_BACKOFF_SECONDS[backoffIdx]
        setRetryStatus({ attempt: attempt, total: totalAttempts, nextDelaySec: delaySec })
        try {
          await sleepAbortable(delaySec * 1000, controller.signal)
        } catch {
          return
        }
      }
    } catch (err) {
      console.error('[AppChat] Error:', err)
      showToast('error', 'שגיאה בחיבור לשרת')
    } finally {
      if (retryControllerRef.current === controller) retryControllerRef.current = null
      setLoading(false)
      setRetryStatus(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [input, loading, uid, activeChatId, showToast])

  // Cancel any in-flight retry when the component unmounts or the user logs out.
  useEffect(() => {
    return () => {
      if (retryControllerRef.current) {
        retryControllerRef.current.abort()
        retryControllerRef.current = null
      }
    }
  }, [])

  const handleSelect = async (searchKey: string, resultIndex: number) => {
    setSelectingKey(searchKey)
    try {
      const token = await getIdToken()
      const res = await fetch('/api/chat/select', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ searchKey, resultIndex }),
      })

      const data = await res.json()
      if (data.success) {
        const assistantMsg: Message = { role: 'assistant', content: data.message }
        setMessages(prev => [...prev, assistantMsg])
        if (uid && activeChatId) {
          await chatHistoryStore.appendMessage(uid, activeChatId, assistantMsg)
        }
        setPendingSelections(prev => prev.filter(s => s.searchKey !== searchKey))
      } else {
        showToast('error', data.error || 'שגיאה בבחירת המוצר')
      }
    } catch (err) {
      console.error('[AppChat] Select error:', err)
      showToast('error', 'שגיאה בחיבור לשרת')
    } finally {
      setSelectingKey(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="app-chat">
      <div className="app-chat-messages">
        {messages.length === 0 && (
          <div className="app-chat-empty">
            <span style={{ fontSize: '2.5rem' }}>💬</span>
            <h3>העוזר האישי</h3>
            <p>ניהול רשימות קניות, משימות ועוד. כתוב מה שצריך!</p>
            <div className="app-chat-hints">
              <span>תוסיף חלב וביצים</span>
              <span>מה ברשימה?</span>
              <span>תזמין הזמנה</span>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="app-chat-message-group">
            {msg.thinking && <ThinkingBubble text={msg.thinking} />}
            <div className={`app-chat-bubble ${msg.role === 'user' ? 'app-chat-user' : 'app-chat-assistant'}`}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Product selection cards */}
        {pendingSelections.map((sel) => (
          <div key={sel.searchKey} className="app-chat-selection">
            <div className="app-chat-selection-title">
              בחר &quot;{sel.query}&quot; ({sel.target === 'standing' ? 'רשימה קבועה' : 'הזמנה'}):
            </div>
            <div className="app-chat-selection-options">
              {sel.results.map((r, idx) => (
                <button
                  key={idx}
                  className="app-chat-product-btn"
                  disabled={selectingKey === sel.searchKey}
                  onClick={() => handleSelect(sel.searchKey, idx)}
                >
                  <span className="app-chat-product-name">{r.name}</span>
                  {r.brand && <span className="app-chat-product-brand">{r.brand}</span>}
                  <span className="app-chat-product-price">{r.price}₪</span>
                  {r.unitPrice && <span className="app-chat-product-unit">{r.unitPrice}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}

        {loading && !retryStatus && (
          <div className="app-chat-bubble app-chat-assistant app-chat-loading">
            <span className="mr-dot-pulse" />
          </div>
        )}

        {retryStatus && (
          <div
            className="app-chat-bubble app-chat-assistant"
            style={{ background: '#fef3c7', color: '#92400e', borderRadius: '0.5rem', padding: '0.6rem 0.8rem' }}
          >
            🤖 המערכת מתקשה לענות — מנסה שוב (ניסיון {retryStatus.attempt}/{retryStatus.total}). הניסיון הבא בעוד {formatDelay(retryStatus.nextDelaySec)}.
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="app-chat-input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="כתוב הודעה..."
          rows={2}
          disabled={loading}
          className="app-chat-textarea"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="app-chat-send"
        >
          שלח
        </button>
      </div>
    </div>
  )
}
