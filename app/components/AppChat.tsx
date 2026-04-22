'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import { getIdToken } from '@/app/services/firebaseAuthService'
import { subscribeToAuth } from '@/app/stores/authStore'
import { chatHistoryStore, type ChatMessage, type ChatPendingSelection } from '@/app/stores/chatHistoryStore'

type Message = ChatMessage

type ProductResult = {
  catalogId: string
  name: string
  brand: string
  price: string
  unitPrice: string
}

type PendingSelection = ChatPendingSelection

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

export default function AppChat() {
  const { showToast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [pendingSelections, setPendingSelections] = useState<PendingSelection[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectingKey, setSelectingKey] = useState<string | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingSelections])

  // Hydrate from localStorage once we know who the user is.
  useEffect(() => {
    const unsubscribe = subscribeToAuth(({ user, initialized }) => {
      if (!initialized) return
      if (!user) {
        setUid(null)
        return
      }
      if (uid === user.uid) return // already hydrated for this user
      setUid(user.uid)
      const restored = chatHistoryStore.load(user.uid)
      if (restored) {
        setMessages(restored.messages)
        setPendingSelections(restored.pendingSelections)
      }
    })
    return () => unsubscribe()
  }, [uid])

  // Persist on every message/selection change.
  useEffect(() => {
    if (!uid) return
    chatHistoryStore.save(uid, { messages, pendingSelections })
  }, [uid, messages, pendingSelections])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setPendingSelections([])

    try {
      const token = await getIdToken()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
      })

      const data = await res.json()
      if (data.success) {
        const assistantMsg: Message = { role: 'assistant', content: data.reply, thinking: data.thinking }
        setMessages(prev => [...prev, assistantMsg])
        if (data.pendingSelections?.length) {
          setPendingSelections(data.pendingSelections)
        }
      } else {
        showToast('error', data.error || 'שגיאה בשליחת ההודעה')
      }
    } catch (err) {
      console.error('[AppChat] Error:', err)
      showToast('error', 'שגיאה בחיבור לשרת')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [input, loading, showToast])

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
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
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

        {loading && (
          <div className="app-chat-bubble app-chat-assistant app-chat-loading">
            <span className="mr-dot-pulse" />
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
