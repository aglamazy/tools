'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { userTierStore, UserTier } from '@/app/stores/userTierStore'
import {
  hasGmailAccess,
  requestGmailAccess,
  fetchInboxMessages,
  fetchMessageBody,
  trashMessage,
  trashMessages,
  searchMessages,
  archiveMessages,
  createFilter,
  buildQueryFromCriteria,
  listLabels,
  listFilters,
  deleteFilter,
  type GmailMessage,
  type GmailFilterCriteria,
  type GmailLabel,
  type GmailFilter,
} from '@/app/services/gmailService'
import { generateArchiveQuery } from '@/app/services/geminiService'
import Link from 'next/link'

type ArchiveState =
  | { step: 'idle' }
  | { step: 'loading'; messageId: string }
  | { step: 'review'; messageId: string; criteria: GmailFilterCriteria; matchCount: number; matchIds: string[] }
  | { step: 'applying'; messageId: string }

export default function GmailPage() {
  const [hasAccess, setHasAccess] = useState(false)
  const [hasTierAccess, setHasTierAccess] = useState(userTierStore.hasAccess(UserTier.PRO))
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(25)
  const [pageTokenStack, setPageTokenStack] = useState<string[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [connectingGmail, setConnectingGmail] = useState(false)
  const [trashingId, setTrashingId] = useState<string | null>(null)
  const [archiveState, setArchiveState] = useState<ArchiveState>({ step: 'idle' })
  const [editFrom, setEditFrom] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [openMsg, setOpenMsg] = useState<GmailMessage | null>(null)
  const [msgBody, setMsgBody] = useState<{ body: string; contentType: 'html' | 'text' } | null>(null)
  const [loadingBody, setLoadingBody] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [showManualArchive, setShowManualArchive] = useState(false)
  const [manualFrom, setManualFrom] = useState('')
  const [manualSubject, setManualSubject] = useState('')
  const [selectedLabelId, setSelectedLabelId] = useState('')
  const [archiveAsDelete, setArchiveAsDelete] = useState(false)
  const [userLabels, setUserLabels] = useState<GmailLabel[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<GmailFilter[]>([])
  const [filtersLoading, setFiltersLoading] = useState(false)
  const [deletingFilterId, setDeletingFilterId] = useState<string | null>(null)
  const [labelsForFilters, setLabelsForFilters] = useState<Record<string, string>>({})
  const [unsubCleanup, setUnsubCleanup] = useState<{
    from: string
    matchIds: string[]
    loading: boolean
    deleting: boolean
  } | null>(null)

  useEffect(() => {
    const unsubscribe = userTierStore.subscribe((tier) => {
      setHasTierAccess(userTierStore.hasAccess(UserTier.PRO))
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!hasTierAccess) return
    const connected = hasGmailAccess()
    setHasAccess(connected)
    if (connected) {
      loadMessages()
      loadLabels()
    }
  }, [hasTierAccess])

  const USEFUL_SYSTEM_LABELS = new Set(['STARRED', 'IMPORTANT'])
  const SYSTEM_LABEL_NAMES: Record<string, string> = { STARRED: 'מסומן בכוכב', IMPORTANT: 'חשוב' }

  const loadLabels = async () => {
    const result = await listLabels()
    if (!result.error) {
      const system = result.labels
        .filter(l => USEFUL_SYSTEM_LABELS.has(l.id))
        .map(l => ({ ...l, name: SYSTEM_LABEL_NAMES[l.id] || l.name }))
      const user = result.labels
        .filter(l => l.type === 'user')
        .sort((a, b) => a.name.localeCompare(b.name))
      setUserLabels([...system, ...user])
    }
  }

  const loadMessages = async (size?: number, pageToken?: string) => {
    setLoading(true)
    setError(null)
    const result = await fetchInboxMessages(size ?? pageSize, pageToken)
    if (result.error) {
      setError(result.error)
      if (result.error.includes('פג תוקף')) {
        setHasAccess(false)
      }
    }
    setMessages(result.messages)
    setNextPageToken(result.nextPageToken)
    setLoading(false)
  }

  const handleNextPage = () => {
    if (!nextPageToken) return
    setPageTokenStack(prev => [...prev, nextPageToken])
    loadMessages(pageSize, nextPageToken)
  }

  const handlePrevPage = () => {
    if (pageTokenStack.length === 0) return
    const newStack = [...pageTokenStack]
    newStack.pop()
    const prevToken = newStack.length > 0 ? newStack[newStack.length - 1] : undefined
    setPageTokenStack(newStack)
    loadMessages(pageSize, prevToken)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPageTokenStack([])
    setNextPageToken(undefined)
    loadMessages(newSize)
  }

  const handleConnect = async () => {
    setConnectingGmail(true)
    setError(null)
    const result = await requestGmailAccess()
    if (result.success) {
      setHasAccess(true)
      await loadMessages()
      loadLabels()
    } else if (result.error) {
      setError(result.error)
    }
    setConnectingGmail(false)
  }

  const handleTrash = async (messageId: string) => {
    setTrashingId(messageId)
    const result = await trashMessage(messageId)
    if (result.success) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    } else if (result.error) {
      setError(result.error)
    }
    setTrashingId(null)
  }

  const handleArchiveLikeThis = async (msg: GmailMessage) => {
    setArchiveState({ step: 'loading', messageId: msg.id })
    setError(null)

    // Step 1: Ask Gemini for filter criteria
    const geminiResult = await generateArchiveQuery(msg.subject, msg.from)
    if (geminiResult.error || !geminiResult.criteria) {
      setError(geminiResult.error || 'שגיאה בחילוץ קריטריונים')
      setArchiveState({ step: 'idle' })
      return
    }

    const criteria = geminiResult.criteria

    // Step 2: Search for matching messages
    const query = buildQueryFromCriteria(criteria)
    const searchResult = await searchMessages(query)
    if (searchResult.error) {
      setError(searchResult.error)
      setArchiveState({ step: 'idle' })
      return
    }

    // Set up review state
    setEditFrom(criteria.from || '')
    setEditSubject(criteria.subject || '')
    setArchiveState({
      step: 'review',
      messageId: msg.id,
      criteria,
      matchCount: searchResult.messageIds.length,
      matchIds: searchResult.messageIds,
    })
  }

  const handleResearch = async () => {
    if (archiveState.step !== 'review') return

    const criteria: GmailFilterCriteria = {}
    if (editFrom.trim()) criteria.from = editFrom.trim()
    if (editSubject.trim()) criteria.subject = editSubject.trim()

    if (!criteria.from && !criteria.subject) {
      setError('יש למלא לפחות שדה אחד')
      return
    }

    setError(null)
    const msgId = archiveState.messageId
    setArchiveState({ step: 'loading', messageId: msgId })

    const query = buildQueryFromCriteria(criteria)
    const searchResult = await searchMessages(query)
    if (searchResult.error) {
      setError(searchResult.error)
      setArchiveState({ step: 'idle' })
      return
    }

    setArchiveState({
      step: 'review',
      messageId: msgId,
      criteria,
      matchCount: searchResult.messageIds.length,
      matchIds: searchResult.messageIds,
    })
  }

  const handleConfirmArchive = async () => {
    if (archiveState.step !== 'review') return

    const { matchIds } = archiveState
    const criteria: GmailFilterCriteria = {}
    if (editFrom.trim()) criteria.from = editFrom.trim()
    if (editSubject.trim()) criteria.subject = editSubject.trim()

    setArchiveState({ step: 'applying', messageId: archiveState.messageId })
    setError(null)

    const labelIds = selectedLabelId ? [selectedLabelId] : undefined

    if (archiveAsDelete) {
      // Delete mode: trash existing matches, create filter that auto-deletes
      if (matchIds.length > 0) {
        const trashResult = await trashMessages(matchIds)
        if (trashResult.error) {
          setError(trashResult.error)
          setArchiveState({ step: 'idle' })
          return
        }
      }
      // Create filter that auto-archives (Gmail filters can't auto-trash, but archive removes from inbox)
      const filterResult = await createFilter(criteria)
      if (filterResult.error) {
        setError(filterResult.error)
        setArchiveState({ step: 'idle' })
        return
      }
    } else {
      // Archive mode: create filter with optional label, archive existing
      const filterResult = await createFilter(criteria, labelIds)
      if (filterResult.error) {
        setError(filterResult.error)
        setArchiveState({ step: 'idle' })
        return
      }

      if (matchIds.length > 0) {
        const archiveResult = await archiveMessages(matchIds, labelIds)
        if (archiveResult.error) {
          setError(archiveResult.error)
          setArchiveState({ step: 'idle' })
          return
        }
      }
    }

    // Remove archived messages from the displayed list
    const archivedSet = new Set(matchIds)
    setMessages((prev) => prev.filter((m) => !archivedSet.has(m.id)))
    setArchiveState({ step: 'idle' })
    setShowManualArchive(false)
    setSelectedLabelId('')
    setArchiveAsDelete(false)
  }

  const handleManualSearch = async () => {
    const criteria: GmailFilterCriteria = {}
    if (manualFrom.trim()) criteria.from = manualFrom.trim()
    if (manualSubject.trim()) criteria.subject = manualSubject.trim()

    if (!criteria.from && !criteria.subject) {
      setError('יש למלא לפחות שדה אחד')
      return
    }

    setError(null)
    setEditFrom(manualFrom.trim())
    setEditSubject(manualSubject.trim())
    setArchiveState({ step: 'loading', messageId: '' })

    const query = buildQueryFromCriteria(criteria)
    const searchResult = await searchMessages(query)
    if (searchResult.error) {
      setError(searchResult.error)
      setArchiveState({ step: 'idle' })
      return
    }

    setArchiveState({
      step: 'review',
      messageId: '',
      criteria,
      matchCount: searchResult.messageIds.length,
      matchIds: searchResult.messageIds,
    })
  }

  const handleOpenMessage = async (msg: GmailMessage) => {
    setOpenMsg(msg)
    setMsgBody(null)
    setLoadingBody(true)
    const result = await fetchMessageBody(msg.id)
    if (result.error) {
      setError(result.error)
      setLoadingBody(false)
      return
    }
    setMsgBody({ body: result.body, contentType: result.contentType })
    setLoadingBody(false)
  }

  const handleCloseMessage = useCallback(() => {
    setOpenMsg(null)
    setMsgBody(null)
  }, [])

  const handleCloseArchiveModal = useCallback(() => {
    setShowManualArchive(false)
    setArchiveState({ step: 'idle' })
    setSelectedLabelId('')
    setArchiveAsDelete(false)
  }, [])

  const handleOpenFilters = async () => {
    setShowFilters(true)
    setFiltersLoading(true)
    const [filtersResult, labelsResult] = await Promise.all([listFilters(), listLabels()])
    if (filtersResult.error) {
      setError(filtersResult.error)
    } else {
      setFilters(filtersResult.filters)
    }
    // Build label ID → name map for display
    if (!labelsResult.error) {
      const map: Record<string, string> = {}
      for (const l of labelsResult.labels) map[l.id] = l.name
      setLabelsForFilters(map)
    }
    setFiltersLoading(false)
  }

  const handleDeleteFilter = async (filterId: string) => {
    setDeletingFilterId(filterId)
    const result = await deleteFilter(filterId)
    if (result.error) {
      setError(result.error)
    } else {
      setFilters(prev => prev.filter(f => f.id !== filterId))
    }
    setDeletingFilterId(null)
  }

  const handleUnsubscribe = async (msg: GmailMessage) => {
    // Open the unsubscribe URL
    window.open(msg.unsubscribeUrl!, '_blank', 'noopener')

    // Extract the sender email for searching
    const emailMatch = msg.from.match(/<([^>]+)>/)
    const fromEmail = emailMatch ? emailMatch[1] : msg.from

    setUnsubCleanup({ from: fromEmail, matchIds: [], loading: true, deleting: false })

    const searchResult = await searchMessages(`from:(${fromEmail})`)
    if (searchResult.error) {
      setError(searchResult.error)
      setUnsubCleanup(null)
      return
    }

    setUnsubCleanup({ from: fromEmail, matchIds: searchResult.messageIds, loading: false, deleting: false })
  }

  const handleConfirmUnsubCleanup = async () => {
    if (!unsubCleanup || unsubCleanup.matchIds.length === 0) return

    setUnsubCleanup(prev => prev && { ...prev, deleting: true })

    const result = await trashMessages(unsubCleanup.matchIds)
    if (result.error) {
      setError(result.error)
      setUnsubCleanup(null)
      return
    }

    const deletedSet = new Set(unsubCleanup.matchIds)
    setMessages(prev => prev.filter(m => !deletedSet.has(m.id)))
    setUnsubCleanup(null)
  }

  // Write HTML content to iframe after it renders
  useEffect(() => {
    if (msgBody?.contentType === 'html' && iframeRef.current) {
      const doc = iframeRef.current.contentDocument
      if (doc) {
        doc.open()
        doc.write(`<!DOCTYPE html><html dir="auto"><head><meta charset="utf-8"><style>body{font-family:sans-serif;margin:1rem;color:#1f2937;font-size:14px;line-height:1.5}img{max-width:100%;height:auto}</style></head><body>${msgBody.body}</body></html>`)
        doc.close()
      }
    }
  }, [msgBody])

  const formatSender = (from: string): string => {
    const match = from.match(/^"?(.+?)"?\s*</)
    return match ? match[1] : from
  }

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      const now = new Date()
      const isToday = d.toDateString() === now.toDateString()
      if (isToday) {
        return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      }
      return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
    } catch {
      return dateStr
    }
  }

  const isArchiveBusy = archiveState.step === 'loading' || archiveState.step === 'applying'
  const showArchiveModal = showManualArchive || archiveState.step === 'review' || archiveState.step === 'applying'

  // Tier gate
  if (!hasTierAccess) {
    return (
      <main className="app" dir="rtl">
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h1 style={{ marginBottom: '1rem' }}>Gmail</h1>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            תכונה זו זמינה למנויי <strong>מקצועי</strong> ומעלה
          </p>
          <Link
            href="/pricing"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            שדרג עכשיו
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header style={{ marginBottom: '1rem' }}>
          <h1 style={{ marginBottom: '0.25rem' }}>Gmail</h1>
          <p style={{ margin: 0, color: '#6b7280' }}>צפייה ומיון תיבת הדואר הנכנס</p>
        </header>

        {error && (
          <div
            className="banner"
            style={{
              background: '#fef2f2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {!hasAccess ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              חבר את חשבון ה-Gmail שלך לצפייה בהודעות
            </p>
            <button
              onClick={handleConnect}
              disabled={connectingGmail}
              className="file-picker"
              style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
            >
              {connectingGmail ? 'מתחבר...' : 'התחבר ל-Gmail'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{messages.length} הודעות</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  style={{
                    padding: '0.25rem 0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    background: 'white',
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleOpenFilters}
                  style={{
                    margin: 0,
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    background: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                  }}
                >
                  פילטרים
                </button>
                <button
                  onClick={() => setShowManualArchive((v) => !v)}
                  style={{
                    margin: 0,
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    background: showManualArchive ? '#dbeafe' : 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                  }}
                >
                  ארכוב ידני
                </button>
                <button
                  onClick={() => { setPageTokenStack([]); setNextPageToken(undefined); loadMessages() }}
                  disabled={loading}
                  className="upload-another-btn"
                  style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                >
                  {loading ? 'טוען...' : 'רענן'}
                </button>
              </div>
            </div>

            {loading && messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                טוען הודעות...
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                תיבת הדואר ריקה
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      background: 'white',
                    }}
                  >
                    <div
                      onClick={() => handleOpenMessage(msg)}
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatSender(msg.from)}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: '0.75rem', flexShrink: 0, marginRight: '0.5rem' }}>
                          {formatDate(msg.date)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {msg.subject}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.125rem' }}>
                        {msg.snippet}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button
                        onClick={() => handleArchiveLikeThis(msg)}
                        disabled={isArchiveBusy}
                        title="ארכב הודעות דומות"
                        style={{
                          padding: '0.5rem',
                          background: 'none',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem',
                          cursor: isArchiveBusy ? 'wait' : 'pointer',
                          fontSize: '1rem',
                          opacity: isArchiveBusy && archiveState.step === 'loading' && archiveState.messageId === msg.id ? 0.5 : 1,
                          lineHeight: 1,
                        }}
                      >
                        {archiveState.step === 'loading' && archiveState.messageId === msg.id ? '...' : '📦'}
                      </button>
                      {msg.unsubscribeUrl && (
                        <button
                          onClick={() => handleUnsubscribe(msg)}
                          title="הסר מרשימת תפוצה"
                          style={{
                            padding: '0.5rem',
                            background: 'none',
                            border: '1px solid #e5e7eb',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            lineHeight: 1,
                          }}
                        >
                          🔕
                        </button>
                      )}
                      <button
                        onClick={() => handleTrash(msg.id)}
                        disabled={trashingId === msg.id}
                        title="מחק"
                        style={{
                          padding: '0.5rem',
                          background: 'none',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem',
                          cursor: trashingId === msg.id ? 'wait' : 'pointer',
                          fontSize: '1rem',
                          opacity: trashingId === msg.id ? 0.5 : 1,
                          lineHeight: 1,
                        }}
                      >
                        {trashingId === msg.id ? '...' : '🗑️'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {(pageTokenStack.length > 0 || nextPageToken) && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  onClick={handlePrevPage}
                  disabled={pageTokenStack.length === 0 || loading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: pageTokenStack.length === 0 || loading ? 'default' : 'pointer',
                    fontSize: '0.875rem',
                    color: pageTokenStack.length === 0 ? '#d1d5db' : '#374151',
                  }}
                >
                  הקודם
                </button>
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  עמוד {pageTokenStack.length + 1}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={!nextPageToken || loading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: !nextPageToken || loading ? 'default' : 'pointer',
                    fontSize: '0.875rem',
                    color: !nextPageToken ? '#d1d5db' : '#374151',
                  }}
                >
                  הבא
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Archive rule editor modal */}
      {showArchiveModal && (
        <div
          onClick={handleCloseArchiveModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>ארכוב הודעות דומות</div>
              <button
                onClick={handleCloseArchiveModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  lineHeight: 1,
                  padding: '0.25rem',
                }}
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1rem' }}>
              {archiveState.step === 'applying' ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#1e40af' }}>
                  יוצר פילטר ומארכב הודעות...
                </div>
              ) : archiveState.step === 'review' ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.875rem' }}>
                      <span style={{ color: '#374151' }}>שולח (from):</span>
                      <input
                        type="text"
                        value={editFrom}
                        onChange={(e) => setEditFrom(e.target.value)}
                        dir="ltr"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </label>
                    <label style={{ fontSize: '0.875rem' }}>
                      <span style={{ color: '#374151' }}>נושא (subject):</span>
                      <input
                        type="text"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </label>
                  </div>

                  <label style={{ fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                    <span style={{ color: '#374151' }}>תווית (label):</span>
                    <select
                      value={selectedLabelId}
                      onChange={(e) => setSelectedLabelId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        marginTop: '0.25rem',
                        fontSize: '0.875rem',
                        background: 'white',
                      }}
                    >
                      <option value="">ללא תווית</option>
                      {userLabels.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </label>

                  <div style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem' }}>
                    {archiveState.matchCount} הודעות תואמות בתיבה
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: archiveAsDelete ? '#dc2626' : '#374151',
                    }}
                  >
                    <div
                      onClick={() => setArchiveAsDelete(v => !v)}
                      style={{
                        width: '2.5rem',
                        height: '1.375rem',
                        borderRadius: '0.75rem',
                        background: archiveAsDelete ? '#dc2626' : '#d1d5db',
                        position: 'relative',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: '1.125rem',
                          height: '1.125rem',
                          borderRadius: '50%',
                          background: 'white',
                          position: 'absolute',
                          top: '0.125rem',
                          transition: 'right 0.2s, left 0.2s',
                          ...(archiveAsDelete
                            ? { left: '0.125rem' }
                            : { left: 'calc(100% - 1.25rem)' }),
                        }}
                      />
                    </div>
                    <span style={{ fontWeight: archiveAsDelete ? 600 : 400 }}>
                      מחק במקום לארכב
                    </span>
                  </label>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleResearch}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      חפש שוב
                    </button>
                    <button
                      onClick={handleConfirmArchive}
                      style={{
                        padding: '0.5rem 1rem',
                        background: archiveAsDelete ? '#dc2626' : '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                    >
                      {archiveAsDelete ? 'מחק + צור פילטר' : 'ארכב + צור פילטר'}
                    </button>
                    <button
                      onClick={handleCloseArchiveModal}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'none',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                      }}
                    >
                      ביטול
                    </button>
                  </div>
                </>
              ) : (
                /* Manual archive entry form */
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.875rem' }}>
                      <span style={{ color: '#374151' }}>שולח (from):</span>
                      <input
                        type="text"
                        value={manualFrom}
                        onChange={(e) => setManualFrom(e.target.value)}
                        dir="ltr"
                        placeholder="notifications@github.com"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </label>
                    <label style={{ fontSize: '0.875rem' }}>
                      <span style={{ color: '#374151' }}>נושא (subject):</span>
                      <input
                        type="text"
                        value={manualSubject}
                        onChange={(e) => setManualSubject(e.target.value)}
                        placeholder="חשבונית"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleManualSearch}
                      disabled={isArchiveBusy}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                    >
                      חפש ובדוק
                    </button>
                    <button
                      onClick={handleCloseArchiveModal}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'none',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                      }}
                    >
                      ביטול
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unsubscribe cleanup modal */}
      {unsubCleanup && (
        <div
          onClick={() => setUnsubCleanup(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '420px',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>הסרה מרשימת תפוצה</div>
              <button
                onClick={() => setUnsubCleanup(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  lineHeight: 1,
                  padding: '0.25rem',
                }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: '1rem' }}>
              {unsubCleanup.loading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280' }}>מחפש הודעות מהשולח...</div>
              ) : unsubCleanup.deleting ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#dc2626' }}>מוחק {unsubCleanup.matchIds.length} הודעות...</div>
              ) : unsubCleanup.matchIds.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ color: '#6b7280', marginBottom: '1rem' }}>לא נמצאו הודעות נוספות מהשולח הזה.</div>
                  <button
                    onClick={() => setUnsubCleanup(null)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'none',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    סגור
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
                    <span>נמצאו </span>
                    <strong>{unsubCleanup.matchIds.length}</strong>
                    <span> הודעות מ-</span>
                    <span dir="ltr" style={{ fontWeight: 500 }}>{unsubCleanup.from}</span>
                    <span>. למחוק את כולן?</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleConfirmUnsubCleanup}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                    >
                      מחק הכל
                    </button>
                    <button
                      onClick={() => setUnsubCleanup(null)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'none',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                      }}
                    >
                      לא, תודה
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters review modal */}
      {showFilters && (
        <div
          onClick={() => setShowFilters(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '540px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontWeight: 600 }}>פילטרים</div>
              <button
                onClick={() => setShowFilters(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  lineHeight: 1,
                  padding: '0.25rem',
                }}
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              {filtersLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>טוען פילטרים...</div>
              ) : filters.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>אין פילטרים</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {filters.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid #f3f4f6',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, fontSize: '0.875rem' }}>
                        {f.criteria.from && (
                          <div>
                            <span style={{ color: '#6b7280' }}>שולח: </span>
                            <span dir="ltr" style={{ fontWeight: 500 }}>{f.criteria.from}</span>
                          </div>
                        )}
                        {f.criteria.subject && (
                          <div>
                            <span style={{ color: '#6b7280' }}>נושא: </span>
                            <span style={{ fontWeight: 500 }}>{f.criteria.subject}</span>
                          </div>
                        )}
                        {f.criteria.query && (
                          <div>
                            <span style={{ color: '#6b7280' }}>שאילתה: </span>
                            <span dir="ltr" style={{ fontWeight: 500 }}>{f.criteria.query}</span>
                          </div>
                        )}
                        {!f.criteria.from && !f.criteria.subject && !f.criteria.query && (
                          <span style={{ color: '#9ca3af' }}>ללא קריטריונים</span>
                        )}
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                          {f.action.removeLabelIds?.includes('INBOX') && 'ארכוב'}
                          {f.action.addLabelIds && f.action.addLabelIds.length > 0 && (
                            <>{f.action.removeLabelIds?.includes('INBOX') ? ' + ' : ''}תווית: {f.action.addLabelIds.map(id => labelsForFilters[id] || id).join(', ')}</>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteFilter(f.id)}
                        disabled={deletingFilterId === f.id}
                        title="מחק פילטר"
                        style={{
                          padding: '0.375rem 0.75rem',
                          background: 'none',
                          border: '1px solid #fecaca',
                          borderRadius: '0.375rem',
                          cursor: deletingFilterId === f.id ? 'wait' : 'pointer',
                          fontSize: '0.75rem',
                          color: '#dc2626',
                          opacity: deletingFilterId === f.id ? 0.5 : 1,
                          flexShrink: 0,
                        }}
                      >
                        {deletingFilterId === f.id ? '...' : 'מחק'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Email viewer modal */}
      {openMsg && (
        <div
          onClick={handleCloseMessage}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '700px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>{openMsg.subject}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{openMsg.from}</div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>{openMsg.date}</div>
                </div>
                <button
                  onClick={handleCloseMessage}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#6b7280',
                    lineHeight: 1,
                    padding: '0.25rem',
                    flexShrink: 0,
                  }}
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              {loadingBody ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>טוען...</div>
              ) : msgBody?.contentType === 'html' ? (
                <iframe
                  ref={iframeRef}
                  title="email body"
                  sandbox="allow-same-origin"
                  style={{ width: '100%', height: '100%', border: 'none', minHeight: '300px' }}
                />
              ) : (
                <pre
                  dir="auto"
                  style={{
                    padding: '1rem',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'sans-serif',
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    color: '#1f2937',
                  }}
                >
                  {msgBody?.body || openMsg.snippet}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
