'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { scoutResultStore } from '@/app/stores/scoutResultStore'
import { scoutConfigStore } from '@/app/stores/scoutConfigStore'
import type { ScoutResult, ScoutResultStatus } from '@/app/types/scoutResult'
import type { LLMProvider } from '@/app/services/llm/types'
import { llmPrefsStore } from '@/app/stores/llmPrefsStore'

function isValidUrl(s?: string): boolean {
  if (!s) return false
  try { return /^https?:\/\//.test(new URL(s).href) } catch { return false }
}

type AuditionsTabProps = {
  businessId: number
}

type Message = { role: 'user' | 'assistant'; content: string }

const STATUS_LABELS: Record<ScoutResultStatus, string> = {
  new: 'חדש', useful: 'שימושי', not_useful: 'לא רלוונטי',
  apply: 'להגיש', not_yet: 'עוד לא', not_available: 'לא זמין',
}

const STATUS_COLORS: Record<ScoutResultStatus, string> = {
  new: '#2196F3', useful: '#4CAF50', not_useful: '#9E9E9E',
  apply: '#FF9800', not_yet: '#FFC107', not_available: '#F44336',
}

const FILTER_OPTIONS: { value: ScoutResultStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'הכל' }, { value: 'new', label: 'חדש' },
  { value: 'useful', label: 'שימושי' }, { value: 'apply', label: 'להגיש' },
  { value: 'not_yet', label: 'עוד לא' },
]

const FEEDBACK_BUTTONS: { status: ScoutResultStatus; emoji: string; label: string }[] = [
  { status: 'useful', emoji: '✅', label: 'שימושי' },
  { status: 'not_useful', emoji: '❌', label: 'לא רלוונטי' },
  { status: 'apply', emoji: '📝', label: 'להגיש' },
  { status: 'not_yet', emoji: '⏳', label: 'עוד לא' },
  { status: 'not_available', emoji: '🚫', label: 'לא זמין' },
]

export default function AuditionsTab({ businessId }: AuditionsTabProps) {
  // Results state
  const [results, setResults] = useState<ScoutResult[]>([])
  const [filter, setFilter] = useState<ScoutResultStatus | 'all'>('all')
  const [searching, setSearching] = useState(false)
  const [loadingResults, setLoadingResults] = useState(true)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Search prompt state
  const [searchPrompt, setSearchPrompt] = useState('')
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')

  // Provider state
  const [provider, setProvider] = useState<LLMProvider>(llmPrefsStore.getProvider)
  const [anthropicKey, setAnthropicKey] = useState(llmPrefsStore.getAnthropicKey)

  const [initialLoading, setInitialLoading] = useState(true)

  const loadResults = useCallback(async () => {
    setLoadingResults(true)
    const all = await scoutResultStore.getByBusinessId(businessId)
    setResults(all)
    setLoadingResults(false)
  }, [businessId])

  // Load everything on mount
  useEffect(() => {
    const load = async () => {
      const [, config] = await Promise.all([
        loadResults(),
        scoutConfigStore.getByBusinessId(businessId),
      ])
      if (config) {
        setSearchPrompt(config.searchPrompt || '')
        if (config.conversationHistory?.length) {
          setMessages(config.conversationHistory)
        }
      }
      setInitialLoading(false)
    }
    void load()
  }, [businessId, loadResults])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const HIDDEN_STATUSES: ScoutResultStatus[] = ['not_useful', 'not_available']
  const filteredResults = filter === 'all'
    ? results.filter(r => !HIDDEN_STATUSES.includes(r.status))
    : results.filter(r => r.status === filter)

  // --- Handlers ---

  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p)
    llmPrefsStore.setProvider(p)
  }

  const handleAnthropicKeyChange = (key: string) => {
    setAnthropicKey(key)
    llmPrefsStore.setAnthropicKey(key)
  }

  const handleStatusUpdate = async (id: number, status: ScoutResultStatus) => {
    const ok = await scoutResultStore.updateStatus(id, status)
    if (ok) setResults(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  const handleSavePrompt = async () => {
    const trimmed = promptDraft.trim()
    setSearchPrompt(trimmed)
    setEditingPrompt(false)
    await scoutConfigStore.save(businessId, trimmed, messages)
  }

  const buildFeedback = (): string => {
    const useful = results.filter(r => r.status === 'useful' || r.status === 'apply')
    const notUseful = results.filter(r => r.status === 'not_useful')
    const lines: string[] = []
    if (useful.length) {
      lines.push('המשתמש סימן כרלוונטי: ' + useful.map(r => r.title).join(', '))
    }
    if (notUseful.length) {
      lines.push('המשתמש סימן כלא רלוונטי (אל תחזיר דומים): ' + notUseful.map(r => r.title).join(', '))
    }
    return lines.join('\n')
  }

  const handleManualSearch = async () => {
    if (!searchPrompt) return
    setSearching(true)
    try {
      const apiKey = provider === 'anthropic' ? anthropicKey : ''
      const feedback = buildFeedback()
      const response = await fetch('/api/scout/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          searchPrompt,
          feedback,
          provider,
          ...(apiKey && { apiKey }),
        }),
      })
      const data = await response.json()
      if (data.success && data.results?.length) {
        for (const result of data.results) {
          await scoutResultStore.add(result)
        }
        await loadResults()
      }
    } catch (err) {
      console.error('[AuditionsTab] Search error:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleChatSend = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    if (provider === 'anthropic' && !anthropicKey.trim()) return

    const userMessage: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setChatInput('')
    setChatLoading(true)

    try {
      const body: Record<string, unknown> = { messages: newMessages, provider }
      if (provider === 'anthropic') body.apiKey = anthropicKey

      const response = await fetch('/api/scout/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (data.success) {
        const assistantMessage: Message = { role: 'assistant', content: data.message }
        const updatedMessages = [...newMessages, assistantMessage]
        setMessages(updatedMessages)

        const newPrompt = data.searchPrompt || searchPrompt
        setSearchPrompt(newPrompt)
        await scoutConfigStore.save(businessId, newPrompt, updatedMessages)

        // Save any structured results from the chat
        if (data.results?.length) {
          const now = new Date().toISOString()
          for (const r of data.results) {
            await scoutResultStore.add({
              businessId,
              title: r.title,
              url: isValidUrl(r.url) ? r.url : undefined,
              source: r.source,
              summary: r.summary,
              deadline: r.deadline,
              details: r.details,
              status: 'new',
              foundAt: now,
            })
          }
          await loadResults()
        }
      } else {
        setMessages([...newMessages, { role: 'assistant', content: `שגיאה: ${data.error}` }])
      }
    } catch (err) {
      console.error('[ScoutChat] Error:', err)
      setMessages([...newMessages, { role: 'assistant', content: 'שגיאת רשת. נסה שוב.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSend()
    }
  }

  if (initialLoading) {
    return <p style={{ textAlign: 'center', color: '#888' }}>טוען...</p>
  }

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Provider bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>מנוע AI:</span>
        {(['gemini', 'anthropic'] as const).map(p => (
          <button
            key={p}
            onClick={() => handleProviderChange(p)}
            style={{
              padding: '0.2rem 0.6rem', borderRadius: '12px', cursor: 'pointer', fontSize: '0.85rem',
              border: provider === p ? '2px solid var(--accent-color, #007bff)' : '1px solid var(--border-color, #ddd)',
              background: provider === p ? 'var(--accent-color, #007bff)' : 'transparent',
              color: provider === p ? '#fff' : 'inherit',
            }}
          >
            {p === 'gemini' ? 'Gemini' : 'Claude'}
          </button>
        ))}
        {provider === 'anthropic' && (
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => handleAnthropicKeyChange(e.target.value)}
            placeholder="Anthropic API Key"
            style={{
              padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem',
              border: '1px solid var(--border-color, #ddd)', direction: 'ltr',
              flex: 1, minWidth: '200px',
            }}
          />
        )}
      </div>

      {/* Search prompt card */}
      <div style={{
        border: '1px solid var(--border-color, #ddd)', borderRadius: '8px',
        padding: '0.75rem', marginBottom: '1rem',
        background: searchPrompt ? 'var(--card-bg, #fafafa)' : 'transparent',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <strong style={{ fontSize: '0.9rem' }}>פרומפט חיפוש</strong>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!editingPrompt && (
              <button
                onClick={() => { setPromptDraft(searchPrompt); setEditingPrompt(true) }}
                style={{
                  padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem',
                  border: '1px solid var(--border-color, #ddd)', background: 'transparent', cursor: 'pointer',
                }}
              >
                עריכה
              </button>
            )}
            <button
              onClick={handleManualSearch}
              disabled={searching || !searchPrompt}
              style={{
                padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem',
                border: 'none', background: 'var(--accent-color, #007bff)', color: '#fff',
                cursor: searching || !searchPrompt ? 'not-allowed' : 'pointer',
                opacity: searching || !searchPrompt ? 0.6 : 1,
              }}
            >
              {searching ? 'מחפש...' : 'חפש עכשיו'}
            </button>
          </div>
        </div>
        {editingPrompt ? (
          <div>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={4}
              style={{
                width: '100%', padding: '0.5rem', borderRadius: '6px', fontSize: '0.85rem',
                border: '1px solid var(--border-color, #ddd)', direction: 'rtl',
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                onClick={handleSavePrompt}
                style={{
                  padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem',
                  border: 'none', background: 'var(--accent-color, #007bff)', color: '#fff', cursor: 'pointer',
                }}
              >
                שמור
              </button>
              <button
                onClick={() => setEditingPrompt(false)}
                style={{
                  padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem',
                  border: '1px solid var(--border-color, #ddd)', background: 'transparent', cursor: 'pointer',
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        ) : searchPrompt ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#555', whiteSpace: 'pre-wrap' }}>
            {searchPrompt}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#999' }}>
            עדיין לא הוגדר. שוחח/י עם ה-AI למטה כדי להגדיר חיפוש.
          </p>
        )}
      </div>

      {/* Two-column layout: chat + results */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Chat panel */}
        <div style={{
          border: '1px solid var(--border-color, #ddd)', borderRadius: '8px',
          padding: '0.75rem', display: 'flex', flexDirection: 'column',
        }}>
          <strong style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>שיחה עם ה-AI</strong>
          <div style={{
            flex: 1, minHeight: '300px', maxHeight: '500px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem',
          }}>
            {messages.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#888', fontSize: '0.85rem', marginTop: '2rem' }}>
                ספר/י מה את/ה מחפש/ת — אודישנים, תחרויות, הופעות...
              </p>
            ) : (
              messages.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                  background: msg.role === 'user' ? 'var(--accent-color, #007bff)' : 'var(--card-bg, #f0f0f0)',
                  color: msg.role === 'user' ? '#fff' : 'inherit',
                  padding: '0.4rem 0.65rem', borderRadius: '10px', maxWidth: '85%',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.9rem',
                }}>
                  {msg.content}
                </div>
              ))
            )}
            {chatLoading && (
              <div style={{ alignSelf: 'flex-end', color: '#888', padding: '0.4rem 0.65rem', fontSize: '0.85rem' }}>
                מחפש...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="מה את/ה מחפש/ת?"
              disabled={chatLoading}
              style={{
                flex: 1, padding: '0.4rem 0.65rem', borderRadius: '8px',
                border: '1px solid var(--border-color, #ddd)', fontSize: '0.9rem', direction: 'rtl',
              }}
            />
            <button
              onClick={handleChatSend}
              disabled={chatLoading || !chatInput.trim() || (provider === 'anthropic' && !anthropicKey.trim())}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none',
                background: 'var(--accent-color, #007bff)', color: '#fff',
                cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                opacity: chatLoading || !chatInput.trim() ? 0.6 : 1,
              }}
            >
              שלח
            </button>
          </div>
        </div>

        {/* Results panel */}
        <div style={{
          border: '1px solid var(--border-color, #ddd)', borderRadius: '8px',
          padding: '0.75rem', display: 'flex', flexDirection: 'column',
        }}>
          <strong style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>תוצאות</strong>

          {/* Filter bar */}
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                style={{
                  padding: '0.15rem 0.5rem', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem',
                  border: filter === opt.value ? '2px solid var(--accent-color, #007bff)' : '1px solid var(--border-color, #ddd)',
                  background: filter === opt.value ? 'var(--accent-color, #007bff)' : 'transparent',
                  color: filter === opt.value ? '#fff' : 'inherit',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Results list */}
          <div style={{ flex: 1, minHeight: '300px', maxHeight: '500px', overflowY: 'auto' }}>
            {loadingResults ? (
              <p style={{ textAlign: 'center', color: '#888' }}>טוען...</p>
            ) : filteredResults.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '2rem', fontSize: '0.85rem' }}>
                {results.length === 0 ? 'אין תוצאות עדיין' : 'אין תוצאות בסינון הנוכחי'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredResults.map(result => (
                  <div key={result.id} style={{
                    border: '1px solid var(--border-color, #ddd)', borderRadius: '8px', padding: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 0.2rem 0', fontSize: '0.9rem' }}>
                          {isValidUrl(result.url) ? (
                            <a href={result.url} target="_blank" rel="noopener noreferrer"
                              style={{ color: 'var(--accent-color, #007bff)', textDecoration: 'none' }}>
                              {result.title}
                            </a>
                          ) : result.title}
                        </h4>
                        <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.8rem', color: '#666' }}>{result.summary}</p>
                        {result.deadline && (
                          <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.8rem' }}>
                            <strong>דדליין:</strong> {result.deadline}
                          </p>
                        )}
                        {result.details && (
                          <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.8rem', color: '#555' }}>{result.details}</p>
                        )}
                        {result.source && (
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#999' }}>מקור: {result.source}</p>
                        )}
                      </div>
                      <span style={{
                        padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.7rem',
                        fontWeight: 'bold', color: '#fff', background: STATUS_COLORS[result.status], whiteSpace: 'nowrap',
                      }}>
                        {STATUS_LABELS[result.status]}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.2rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      {FEEDBACK_BUTTONS.map(btn => (
                        <button
                          key={btn.status}
                          onClick={() => result.id && handleStatusUpdate(result.id, btn.status)}
                          title={btn.label}
                          style={{
                            padding: '0.15rem 0.4rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem',
                            border: result.status === btn.status ? '2px solid var(--accent-color, #007bff)' : '1px solid var(--border-color, #ddd)',
                            background: result.status === btn.status ? 'var(--accent-light, #e3f2fd)' : 'transparent',
                          }}
                        >
                          {btn.emoji} {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
