'use client'

import { useState, useRef, useEffect } from 'react'
import Modal from '@/app/components/Modal'
import { scoutConfigStore } from '@/app/stores/scoutConfigStore'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type ScoutChatDialogProps = {
  isOpen: boolean
  onClose: () => void
  businessId: number
  onConfigSaved?: () => void
}

export default function ScoutChatDialog({ isOpen, onClose, businessId, onConfigSaved }: ScoutChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load conversation history on open
  useEffect(() => {
    if (!isOpen) return
    const load = async () => {
      setLoadingHistory(true)
      const config = await scoutConfigStore.getByBusinessId(businessId)
      if (config?.conversationHistory?.length) {
        setMessages(config.conversationHistory)
      }
      setLoadingHistory(false)
    }
    void load()
  }, [isOpen, businessId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMessage: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/scout/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      const data = await response.json()
      if (data.success) {
        const assistantMessage: Message = { role: 'assistant', content: data.message }
        const updatedMessages = [...newMessages, assistantMessage]
        setMessages(updatedMessages)

        // Save config if Claude returned one
        if (data.searchConfig) {
          await scoutConfigStore.save(businessId, data.searchConfig, updatedMessages)
          onConfigSaved?.()
        } else {
          // Save conversation history even without config
          await scoutConfigStore.save(businessId, {}, updatedMessages)
        }
      } else {
        setMessages([...newMessages, { role: 'assistant', content: `שגיאה: ${data.error}` }])
      }
    } catch (err) {
      console.error('[ScoutChat] Error:', err)
      setMessages([...newMessages, { role: 'assistant', content: 'שגיאת רשת. נסה שוב.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="700px">
      <div style={{ direction: 'rtl', padding: '1rem' }}>
        <h2 style={{ margin: '0 0 1rem 0' }}>הגדרות חיפוש אודישנים</h2>

        <div style={{
          height: '400px',
          overflowY: 'auto',
          border: '1px solid var(--border-color, #ddd)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          {loadingHistory ? (
            <p style={{ textAlign: 'center', color: '#888' }}>טוען...</p>
          ) : messages.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888' }}>
              ספר/י מה את/ה מחפש/ת — אודישנים, תחרויות, הופעות...
            </p>
          ) : (
            messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                background: msg.role === 'user' ? 'var(--accent-color, #007bff)' : 'var(--card-bg, #f0f0f0)',
                color: msg.role === 'user' ? '#fff' : 'inherit',
                padding: '0.5rem 0.75rem',
                borderRadius: '12px',
                maxWidth: '80%',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            ))
          )}
          {loading && (
            <div style={{
              alignSelf: 'flex-end',
              color: '#888',
              padding: '0.5rem 0.75rem',
            }}>
              מחפש...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="מה את/ה מחפש/ת?"
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #ddd)',
              fontSize: '1rem',
              direction: 'rtl',
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent-color, #007bff)',
              color: '#fff',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !input.trim() ? 0.6 : 1,
            }}
          >
            שלח
          </button>
        </div>
      </div>
    </Modal>
  )
}
