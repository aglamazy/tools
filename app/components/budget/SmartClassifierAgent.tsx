'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { transactionStore } from '@/app/stores/transactionStore'
import { subjectStore } from '@/app/stores/subjectStore'
import SubjectSelect from '@/app/components/budget/SubjectSelect'
import { llmPrefsStore } from '@/app/stores/llmPrefsStore'
import { db } from '@/app/db/financeDB'

async function getClaudeKey(): Promise<string> {
  // Primary: appSettings row key='claudeApiKey' (where the Tax-files / Profile UI write it)
  try {
    const row = await db.appSettings.where('key').equals('claudeApiKey').first()
    const v = row?.value
    if (typeof v === 'string' && v.trim()) return v.trim()
  } catch { /* fall through */ }
  // Fallback: legacy llmPrefsStore localStorage entry
  return llmPrefsStore.getAnthropicKey()
}
import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'

type ConfidentItem = {
  txId: string
  subject: string
  reasoning: string
}

type AskUserItem = {
  txId: string
  business: string
  amount: number
  options: string[]
  why: string
}

type ClassifyResponse = {
  confident: ConfidentItem[]
  askUser: AskUserItem[]
}

type ChatMessage =
  | { id: string; role: 'agent'; text: string }
  | {
      id: string
      role: 'agent-prompt'
      tx: AskUserItem
    }

type Props = {
  month: string
  onClose: () => void
  onApplied: () => void
}

const TOOLBAR_HEIGHT = 56

function formatAmount(n: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(n)
}

function makeMessageId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function SmartClassifierAgent({ month, onClose, onApplied }: Props) {
  const [mounted, setMounted] = useState(false)
  const [phase, setPhase] = useState<'loading' | 'no-key' | 'review-confident' | 'chatting' | 'done' | 'error'>(
    'loading',
  )
  const [errorText, setErrorText] = useState<string>('')
  const [confident, setConfident] = useState<ConfidentItem[]>([])
  const [confidentSelected, setConfidentSelected] = useState<Record<string, boolean>>({})
  const [askUser, setAskUser] = useState<AskUserItem[]>([])
  const [askIdx, setAskIdx] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [savedSubjectsCount, setSavedSubjectsCount] = useState(0)
  // Map txId → business so we can save rules without searching the original transaction list.
  const businessByTxIdRef = useRef<Map<string, string>>(new Map())
  // Map txId → original transaction so the confident review can show date + amount.
  const txByTxIdRef = useRef<Map<string, BudgetTransaction>>(new Map())
  const [loadingStep, setLoadingStep] = useState<string>('טוען עסקאות...')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Mount + ESC to close.
  useEffect(() => {
    setMounted(true)
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Auto-scroll chat to bottom.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initial load: kick off classification.
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const apiKey = await getClaudeKey()
      if (!apiKey) {
        if (!cancelled) setPhase('no-key')
        return
      }

      try {
        if (!cancelled) setLoadingStep('טוען עסקאות...')
        const transactions = await transactionStore.getBudgetTransactions(month)
        const unclassified = transactions.filter(
          (t: BudgetTransaction) => (!t.category || t.category.trim() === '') && !t.isCreditCardCharge,
        )

        if (!cancelled) setLoadingStep(`נמצאו ${unclassified.length} עסקאות לסיווג`)

        if (unclassified.length === 0) {
          if (!cancelled) {
            setPhase('done')
            setMessages([
              {
                id: makeMessageId(),
                role: 'agent',
                text: 'אין עסקאות לא מסווגות לחודש הזה. הכל מסודר!',
              },
            ])
          }
          return
        }

        const categories: Category[] = subjectStore.getAll()

        if (!cancelled) setLoadingStep('בודק היסטוריית סיווגים...')

        // Build the business→subject history from previously classified transactions across all months.
        // This is exactly the signal the existing pattern matcher learns from.
        const allClassified = await transactionStore.getBudgetTransactions(month)
        const historyMap = new Map<string, string>()
        // Pull all months: best effort via getAvailableMonths + per-month fetch would be expensive;
        // instead we rely on the transactions we already loaded plus what we get back from
        // getBudgetTransactions for the same month. The classify route will also see the explicit
        // history we send. Keep it simple: ship what we have for this month first, then enrich.
        for (const t of allClassified) {
          if (t.category && t.category.trim() && t.business) {
            if (!historyMap.has(t.business)) historyMap.set(t.business, t.category)
          }
        }
        // Also enrich with any prior business-category mappings we can read indirectly:
        // do another light pass against earlier months by asking the store for available months.
        try {
          const months = await transactionStore.getAvailableMonths()
          for (const m of months) {
            if (m === month) continue
            const txs = await transactionStore.getBudgetTransactions(m)
            for (const t of txs) {
              if (t.category && t.category.trim() && t.business && !historyMap.has(t.business)) {
                historyMap.set(t.business, t.category)
              }
            }
          }
        } catch {
          // Non-fatal — proceed with whatever history we already have.
        }

        const history = Array.from(historyMap.entries()).map(([business, category]) => ({
          business,
          category,
        }))

        // Remember business names per txId for rule saving later.
        for (const t of unclassified) {
          businessByTxIdRef.current.set(t.id, t.business)
          txByTxIdRef.current.set(t.id, t)
        }

        if (!cancelled) setLoadingStep(`שולח ל-Claude (${unclassified.length} עסקאות)...`)

        const res = await fetch('/api/classify-transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            monthStr: month,
            transactions: unclassified,
            categories,
            history,
          }),
        })

        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Claude error ${res.status}: ${body.slice(0, 200)}`)
        }

        const data = (await res.json()) as ClassifyResponse
        if (cancelled) return

        const safeConfident = Array.isArray(data.confident) ? data.confident : []
        const safeAskUser = Array.isArray(data.askUser) ? data.askUser : []

        setConfident(safeConfident)
        const initSel: Record<string, boolean> = {}
        for (const c of safeConfident) initSel[c.txId] = true
        setConfidentSelected(initSel)
        setAskUser(safeAskUser)

        const intro = `מצאתי ${unclassified.length} עסקאות לא מסווגות לחודש ${month}. סיווגתי ${safeConfident.length} בביטחון. נשארו ${safeAskUser.length} שאני לא בטוח לגביהן.`
        setMessages([{ id: makeMessageId(), role: 'agent', text: intro }])

        if (safeConfident.length > 0) setPhase('review-confident')
        else if (safeAskUser.length > 0) {
          setPhase('chatting')
          startNextAmbiguous(0, safeAskUser)
        } else {
          setPhase('done')
        }
      } catch (err: unknown) {
        if (cancelled) return
        const m = err instanceof Error ? err.message : 'שגיאה לא ידועה'
        setErrorText(m)
        setPhase('error')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [month])

  // Push the next ambiguous transaction prompt into the chat.
  const startNextAmbiguous = (idx: number, list: AskUserItem[]) => {
    if (idx >= list.length) {
      setPhase('done')
      setMessages((prev) => [
        ...prev,
        {
          id: makeMessageId(),
          role: 'agent',
          text: `סיימתי. סיווגתי ${savedSubjectsCount} עסקאות.`,
        },
      ])
      onApplied()
      return
    }
    const tx = list[idx]
    setMessages((prev) => [...prev, { id: makeMessageId(), role: 'agent-prompt', tx }])
    setAskIdx(idx)
  }

  const applyConfident = async () => {
    let count = 0
    for (const c of confident) {
      if (!confidentSelected[c.txId]) continue
      const business = businessByTxIdRef.current.get(c.txId)
      // Update the transaction itself + teach the pattern matcher.
      const ok = await transactionStore.updateAny(c.txId, { category: c.subject })
      if (ok) {
        count += 1
        if (business) await transactionStore.saveBusinessCategory(business, c.subject)
      }
    }
    setSavedSubjectsCount((prev) => prev + count)
    onApplied()

    // Move to chatting (or done if there are no ambiguous ones).
    setMessages((prev) => [
      ...prev,
      { id: makeMessageId(), role: 'agent', text: `שמרתי ${count} סיווגים בטוחים.` },
    ])

    if (askUser.length === 0) {
      setMessages((prev) => [
        ...prev,
        { id: makeMessageId(), role: 'agent', text: 'אין עסקאות אמביוולנטיות. סיימנו!' },
      ])
      setPhase('done')
      return
    }

    setPhase('chatting')
    startNextAmbiguous(0, askUser)
  }

  const skipCurrent = () => {
    setMessages((prev) => [...prev, { id: makeMessageId(), role: 'agent', text: 'דילגתי על העסקה הזו.' }])
    startNextAmbiguous(askIdx + 1, askUser)
  }

  const advanceAfterPick = async (subject: string) => {
    const tx = askUser[askIdx]
    if (!tx) return

    const ok = await transactionStore.updateAny(tx.txId, { category: subject })
    if (ok) {
      setSavedSubjectsCount((prev) => prev + 1)
      // Teach the existing 🪄 pattern matcher implicitly on every pick — same behaviour
      // as classifying through the inline subject dropdown on the budget table.
      await transactionStore.saveBusinessCategory(tx.business, subject)
      onApplied()
    }

    setMessages((prev) => [
      ...prev,
      { id: makeMessageId(), role: 'agent', text: `סיווגתי "${tx.business}" כ-"${subject}".` },
    ])

    startNextAmbiguous(askIdx + 1, askUser)
  }

  const onPickOption = (subject: string) => {
    void advanceAfterPick(subject)
  }

  const headerSummary = useMemo(() => {
    if (phase === 'loading') return 'בודק עסקאות...'
    if (phase === 'no-key') return 'נדרש מפתח Anthropic'
    if (phase === 'error') return 'שגיאה'
    if (phase === 'done') return 'סיימתי'
    return `סיווג חכם — ${month}`
  }, [phase, month])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#fff',
          zIndex: 999998,
          direction: 'rtl',
          overflow: 'hidden',
          paddingTop: `${TOOLBAR_HEIGHT}px`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            maxWidth: '720px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          {phase === 'loading' && (
            <div style={{ color: '#64748b', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                display: 'inline-block',
                width: '0.9rem',
                height: '0.9rem',
                border: '2px solid #cbd5e1',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span>{loadingStep}</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {phase === 'no-key' && (
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: '0.5rem',
                padding: '1rem',
                color: '#92400e',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>חסר מפתח Anthropic</div>
              <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                כדי להפעיל סיווג חכם, הזן מפתח Anthropic API בעמוד ההגדרות, ואז חזור לפה.
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div
              style={{
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                padding: '1rem',
                color: '#991b1b',
                fontSize: '0.9rem',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>אירעה שגיאה</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{errorText}</div>
            </div>
          )}

          {(phase === 'review-confident' ||
            phase === 'chatting' ||
            phase === 'done') && (
            <>
              {messages.map((m) => {
                if (m.role === 'agent') {
                  return (
                    <div key={m.id} className="app-chat-message-group">
                      <div className="app-chat-bubble app-chat-assistant">{m.text}</div>
                    </div>
                  )
                }
                if (m.role === 'agent-prompt') {
                  const promptTx = txByTxIdRef.current.get(m.tx.txId)
                  const promptIsPositive = m.tx.amount > 0
                  return (
                    <div key={m.id} className="app-chat-message-group">
                      <div className="app-chat-bubble app-chat-assistant">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                          <div style={{ fontWeight: 600 }}>{m.tx.business}</div>
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.85rem', color: '#475569' }}>
                            {promptTx?.date && <span>{promptTx.date}</span>}
                            <span style={{ fontWeight: 500, color: promptIsPositive ? '#16a34a' : '#dc2626' }}>{formatAmount(m.tx.amount)}</span>
                          </div>
                        </div>
                        {promptTx?.paymentMethod && (
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem' }}>{promptTx.paymentMethod}</div>
                        )}
                        <div style={{ marginBottom: '0.5rem' }}>{m.tx.why}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                          {m.tx.options.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => onPickOption(opt)}
                              style={{
                                padding: '0.4rem 0.8rem',
                                background: '#fff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: '#1e293b',
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                          <SubjectSelect
                            value=""
                            amount={m.tx.amount}
                            categories={subjectStore.getAll()}
                            placeholder="נושא אחר…"
                            skipTaxOptions
                            onChange={(v) => { if (v) onPickOption(v) }}
                            style={{
                              padding: '0.4rem 0.6rem',
                              background: '#fff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              color: '#1e293b',
                              direction: 'rtl',
                            }}
                          />
                          <button
                            onClick={skipCurrent}
                            style={{
                              padding: '0.4rem 0.8rem',
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              color: '#64748b',
                            }}
                          >
                            דלג
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }
                return null
              })}

              {phase === 'review-confident' && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>סיווגים בטוחים — אשר את אלה שתרצה לשמור:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {confident.map((c) => {
                      const business = businessByTxIdRef.current.get(c.txId) ?? c.txId
                      const tx = txByTxIdRef.current.get(c.txId)
                      const isPositive = (tx?.amount ?? 0) > 0
                      return (
                        <div
                          key={c.txId}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.5rem',
                            padding: '0.5rem',
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.375rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!confidentSelected[c.txId]}
                            onChange={(e) =>
                              setConfidentSelected((prev) => ({ ...prev, [c.txId]: e.target.checked }))
                            }
                            style={{ marginTop: '0.2rem' }}
                          />
                          <div style={{ flex: 1, fontSize: '0.875rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <div style={{ fontWeight: 500 }}>{business}</div>
                              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.8rem', color: '#475569' }}>
                                {tx?.date && <span>{tx.date}</span>}
                                {tx && (
                                  <span style={{ fontWeight: 500, color: isPositive ? '#16a34a' : '#dc2626' }}>
                                    {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(tx.amount)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {tx?.paymentMethod && (
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>{tx.paymentMethod}</div>
                            )}
                            <div style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>נושא:</span>
                              <SubjectSelect
                                value={c.subject}
                                amount={tx?.amount ?? 0}
                                categories={subjectStore.getAll()}
                                skipTaxOptions
                                onChange={(next) => {
                                  setConfident((prev) => prev.map((row) => row.txId === c.txId ? { ...row, subject: next } : row))
                                }}
                                style={{
                                  padding: '0.25rem 0.4rem',
                                  borderRadius: '0.25rem',
                                  border: '1px solid #cbd5e1',
                                  fontSize: '0.8rem',
                                  background: '#fff',
                                  direction: 'rtl',
                                }}
                              />
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem' }}>{c.reasoning}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.4rem' }}>
                    <button
                      onClick={applyConfident}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                      }}
                    >
                      אישור והמשך
                    </button>
                  </div>
                </div>
              )}

            </>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: `${TOOLBAR_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.25rem',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
          zIndex: 999999,
          direction: 'rtl',
          boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
        }}
      >
        <strong style={{ fontSize: '1rem' }}>🤖 {headerSummary}</strong>
        <button
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            fontSize: '0.95rem',
            cursor: 'pointer',
            padding: '0.45rem 0.9rem',
            borderRadius: '0.5rem',
            fontWeight: 600,
          }}
          aria-label="סגור וחזור לתקציב"
          title="ESC"
        >
          ✕ חזור לתקציב
        </button>
      </div>
    </>,
    document.body,
  )
}
