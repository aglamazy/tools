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
import { generateArchiveQuery, extractEventDates } from '@/app/services/geminiService'
import Link from 'next/link'
import { routes } from '@/app/config'

type ExpiredEvent = {
  id: string; from: string; subject: string; snippet: string
  eventDate: string; eventDescription: string; selected: boolean
}

type EventScanState =
  | { step: 'idle' }
  | { step: 'scanning'; progress: string }
  | { step: 'review'; events: ExpiredEvent[] }
  | { step: 'deleting' }

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
  const [pageTokens, setPageTokens] = useState<string[]>([])  // token that loaded each page (index = page-1)
  const [currentPage, setCurrentPage] = useState(0)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [connectingGmail, setConnectingGmail] = useState(false)
  const [trashingId, setTrashingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
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
  const [eventScan, setEventScan] = useState<EventScanState>({ step: 'idle' })
  const [topSenders, setTopSenders] = useState<{
    step: 'idle' | 'scanning' | 'ready'
    progress?: string
    senders: { email: string; name: string; count: number; ids: string[]; selected: boolean }[]
    deletingEmail?: string
    continueToken?: string  // token to fetch next batch
    totalScanned: number
  }>({ step: 'idle', senders: [], totalScanned: 0 })
  const topSendersCancelRef = useRef(false)

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

  const handleGoToPage = (page: number) => {
    if (page === currentPage || loading) return
    const token = page === 0 ? undefined : pageTokens[page]
    if (page > 0 && !token) return
    setCurrentPage(page)
    loadMessages(pageSize, token)
  }

  const handleNextPage = () => {
    if (!nextPageToken || loading) return
    const nextIdx = currentPage + 1
    setPageTokens(prev => {
      const updated = [...prev]
      updated[nextIdx] = nextPageToken
      return updated
    })
    setCurrentPage(nextIdx)
    loadMessages(pageSize, nextPageToken)
  }

  const handleSkipPages = async (count: number) => {
    if (!nextPageToken || loading) return
    setLoading(true)
    setError(null)
    let token: string | undefined = nextPageToken
    let page = currentPage
    const updatedTokens = [...pageTokens]
    for (let i = 0; i < count; i++) {
      if (!token) break
      page++
      updatedTokens[page] = token
      const result = await fetchInboxMessages(pageSize, token)
      if (result.error) {
        setError(result.error)
        if (result.error.includes('פג תוקף')) setHasAccess(false)
        setLoading(false)
        return
      }
      if (i === count - 1 || !result.nextPageToken) {
        // Last skip or no more pages — show these messages
        setPageTokens(updatedTokens)
        setCurrentPage(page)
        setMessages(result.messages)
        setNextPageToken(result.nextPageToken)
        setLoading(false)
        return
      }
      token = result.nextPageToken
    }
    setLoading(false)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPageTokens([])
    setCurrentPage(0)
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

  const handleArchiveSingle = async (messageId: string) => {
    setArchivingId(messageId)
    const result = await archiveMessages([messageId])
    if (result.success) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    } else if (result.error) {
      setError(result.error)
    }
    setArchivingId(null)
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

  const handleEventScan = async () => {
    setEventScan({ step: 'scanning', progress: 'סורק הודעות...' })
    setError(null)

    // Fetch up to 200 inbox messages by paginating
    let allMessages: GmailMessage[] = []
    let token: string | undefined
    for (let i = 0; i < 4; i++) {
      const result = await fetchInboxMessages(50, token)
      if (result.error) {
        setError(result.error)
        setEventScan({ step: 'idle' })
        return
      }
      allMessages = allMessages.concat(result.messages)
      token = result.nextPageToken
      if (!token) break
    }

    if (allMessages.length === 0) {
      setEventScan({ step: 'review', events: [] })
      return
    }

    setEventScan({ step: 'scanning', progress: 'מנתח אירועים...' })

    // Split into batches of 15
    const batches: { id: string; subject: string; snippet: string }[][] = []
    for (let i = 0; i < allMessages.length; i += 15) {
      batches.push(allMessages.slice(i, i + 15).map(m => ({ id: m.id, subject: m.subject, snippet: m.snippet })))
    }

    // Send batches with max 3 concurrent
    const allResults: { id: string; eventDate: string | null; eventDescription: string | null }[] = []
    for (let i = 0; i < batches.length; i += 3) {
      const chunk = batches.slice(i, i + 3)
      const responses = await Promise.all(chunk.map(batch => extractEventDates(batch)))
      for (const resp of responses) {
        if (resp.error) {
          setError(resp.error)
          setEventScan({ step: 'idle' })
          return
        }
        allResults.push(...resp.results)
      }
    }

    // Filter: keep only past event dates
    const today = new Date().toISOString().split('T')[0]
    const msgMap = new Map(allMessages.map(m => [m.id, m]))
    const expired: ExpiredEvent[] = allResults
      .filter(r => r.eventDate && r.eventDate < today)
      .map(r => {
        const msg = msgMap.get(r.id)
        return msg ? {
          id: r.id,
          from: msg.from,
          subject: msg.subject,
          snippet: msg.snippet,
          eventDate: r.eventDate!,
          eventDescription: r.eventDescription || '',
          selected: true,
        } : null
      })
      .filter((e): e is ExpiredEvent => e !== null)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))

    setEventScan({ step: 'review', events: expired })
  }

  const handleEventDelete = async () => {
    if (eventScan.step !== 'review') return
    const selectedIds = eventScan.events.filter(e => e.selected).map(e => e.id)
    if (selectedIds.length === 0) return

    setEventScan({ step: 'deleting' })
    const result = await trashMessages(selectedIds)
    if (result.error) {
      setError(result.error)
      setEventScan({ step: 'idle' })
      return
    }

    const deletedSet = new Set(selectedIds)
    setMessages(prev => prev.filter(m => !deletedSet.has(m.id)))
    setEventScan({ step: 'idle' })
  }

  const handleTopSenders = async (continueFrom?: string) => {
    topSendersCancelRef.current = false

    // Build initial map from existing senders if continuing
    const map = new Map<string, { name: string; count: number; ids: string[] }>()
    let prevTotal = 0
    if (continueFrom) {
      for (const s of topSenders.senders) {
        map.set(s.email, { name: s.name, count: s.count, ids: [...s.ids] })
      }
      prevTotal = topSenders.totalScanned
    }

    setTopSenders({ step: 'scanning', progress: `סורק... ${prevTotal} הודעות`, senders: [], totalScanned: prevTotal })
    setError(null)

    let token: string | undefined = continueFrom
    let total = prevTotal

    for (let i = 0; i < 40; i++) {
      if (topSendersCancelRef.current) return

      const result = await fetchInboxMessages(50, token)
      if (topSendersCancelRef.current) return

      if (result.error) {
        setError(result.error)
        setTopSenders({ step: 'idle', senders: [], totalScanned: 0 })
        return
      }

      for (const msg of result.messages) {
        const emailMatch = msg.from.match(/<([^>]+)>/)
        const email = emailMatch ? emailMatch[1].toLowerCase() : msg.from.toLowerCase()
        const nameMatch = msg.from.match(/^"?(.+?)"?\s*</)
        const name = nameMatch ? nameMatch[1] : email
        const entry = map.get(email)
        if (entry) {
          entry.count++
          entry.ids.push(msg.id)
        } else {
          map.set(email, { name, count: 1, ids: [msg.id] })
        }
      }

      total += result.messages.length
      setTopSenders({ step: 'scanning', progress: `סורק... ${total} הודעות`, senders: [], totalScanned: total })

      token = result.nextPageToken
      if (!token) break
    }

    const senders = Array.from(map.entries())
      .map(([email, data]) => ({ email, ...data, selected: false }))
      .sort((a, b) => b.count - a.count)

    setTopSenders({ step: 'ready', senders, continueToken: token, totalScanned: total })
  }

  const handleTrashSender = async (email: string) => {
    if (topSenders.step !== 'ready') return
    const sender = topSenders.senders.find(s => s.email === email)
    if (!sender) return

    setTopSenders(prev => ({ ...prev, deletingEmail: email }))

    // Search for ALL messages from this sender (not just the ones we fetched)
    const searchResult = await searchMessages(`from:(${email})`)
    if (searchResult.error) {
      setError(searchResult.error)
      setTopSenders(prev => ({ ...prev, deletingEmail: undefined }))
      return
    }

    if (searchResult.messageIds.length > 0) {
      const result = await trashMessages(searchResult.messageIds)
      if (result.error) {
        setError(result.error)
        setTopSenders(prev => ({ ...prev, deletingEmail: undefined }))
        return
      }
      const deletedSet = new Set(searchResult.messageIds)
      setMessages(prev => prev.filter(m => !deletedSet.has(m.id)))
    }

    setTopSenders(prev => ({
      ...prev,
      senders: prev.senders.filter(s => s.email !== email),
      deletingEmail: undefined,
    }))
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
            href={routes.pricing}
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
                  onClick={handleEventScan}
                  disabled={eventScan.step !== 'idle'}
                  style={{
                    margin: 0,
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    background: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: eventScan.step !== 'idle' ? 'wait' : 'pointer',
                  }}
                >
                  ניקוי אירועים
                </button>
                <button
                  onClick={() => handleTopSenders()}
                  disabled={topSenders.step === 'scanning'}
                  style={{
                    margin: 0,
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    background: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: topSenders.step === 'scanning' ? 'wait' : 'pointer',
                  }}
                >
                  שולחים מובילים
                </button>
                <button
                  onClick={() => { setPageTokens([]); setCurrentPage(0); setNextPageToken(undefined); loadMessages() }}
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
                        onClick={() => handleArchiveSingle(msg.id)}
                        disabled={archivingId === msg.id}
                        title="ארכב"
                        style={{
                          padding: '0.5rem',
                          background: 'none',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem',
                          cursor: archivingId === msg.id ? 'wait' : 'pointer',
                          fontSize: '1rem',
                          opacity: archivingId === msg.id ? 0.5 : 1,
                          lineHeight: 1,
                        }}
                      >
                        {archivingId === msg.id ? '...' : '↓'}
                      </button>
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
            {(currentPage > 0 || nextPageToken) && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                {/* Page number buttons for visited pages */}
                {Array.from({ length: currentPage + 1 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => handleGoToPage(i)}
                    disabled={loading}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: i === currentPage ? '#2563eb' : 'none',
                      color: i === currentPage ? 'white' : '#374151',
                      border: `1px solid ${i === currentPage ? '#2563eb' : '#d1d5db'}`,
                      borderRadius: '0.375rem',
                      cursor: i === currentPage || loading ? 'default' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: i === currentPage ? 600 : 400,
                      minWidth: '2.25rem',
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
                {nextPageToken && (
                  <>
                    <button
                      onClick={handleNextPage}
                      disabled={loading}
                      style={{
                        padding: '0.375rem 0.75rem',
                        background: 'none',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        cursor: loading ? 'default' : 'pointer',
                        fontSize: '0.875rem',
                        color: '#374151',
                      }}
                    >
                      הבא
                    </button>
                    <span style={{ color: '#d1d5db', margin: '0 0.125rem' }}>|</span>
                    <button
                      onClick={() => handleSkipPages(5)}
                      disabled={loading}
                      style={{
                        padding: '0.375rem 0.75rem',
                        background: 'none',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        cursor: loading ? 'default' : 'pointer',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                      }}
                    >
                      +5
                    </button>
                    <button
                      onClick={() => handleSkipPages(10)}
                      disabled={loading}
                      style={{
                        padding: '0.375rem 0.75rem',
                        background: 'none',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        cursor: loading ? 'default' : 'pointer',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                      }}
                    >
                      +10
                    </button>
                  </>
                )}
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

      {/* Top senders modal */}
      {topSenders.step !== 'idle' && (
        <div
          onClick={() => { topSendersCancelRef.current = true; setTopSenders({ step: 'idle', senders: [], totalScanned: 0 }) }}
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
            <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontWeight: 600 }}>שולחים מובילים</div>
              <button
                onClick={() => { topSendersCancelRef.current = true; setTopSenders({ step: 'idle', senders: [], totalScanned: 0 }) }}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280', lineHeight: 1, padding: '0.25rem' }}
              >
                &times;
              </button>
            </div>

            {topSenders.step === 'scanning' ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#1e40af' }}>{topSenders.progress || 'סורק...'}</div>
            ) : topSenders.senders.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>לא נמצאו הודעות</div>
            ) : (
              <>
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  {topSenders.senders.map((s) => (
                    <div
                      key={s.email}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.625rem 1rem',
                        borderBottom: '1px solid #f3f4f6',
                      }}
                    >
                      <div style={{
                        background: '#dbeafe',
                        color: '#1e40af',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        borderRadius: '0.375rem',
                        padding: '0.25rem 0.5rem',
                        minWidth: '2rem',
                        textAlign: 'center',
                        flexShrink: 0,
                      }}>
                        {s.count}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.name}
                        </div>
                        <div dir="ltr" style={{ fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.email}
                        </div>
                      </div>
                      <button
                        onClick={() => handleTrashSender(s.email)}
                        disabled={topSenders.deletingEmail === s.email}
                        title="מחק הכל מהשולח"
                        style={{
                          padding: '0.375rem 0.75rem',
                          background: 'none',
                          border: '1px solid #fecaca',
                          borderRadius: '0.375rem',
                          cursor: topSenders.deletingEmail === s.email ? 'wait' : 'pointer',
                          fontSize: '0.75rem',
                          color: '#dc2626',
                          opacity: topSenders.deletingEmail === s.email ? 0.5 : 1,
                          flexShrink: 0,
                        }}
                      >
                        {topSenders.deletingEmail === s.email ? '...' : 'מחק הכל'}
                      </button>
                    </div>
                  ))}
                </div>
                {/* Footer */}
                <div style={{
                  padding: '0.75rem 1rem',
                  borderTop: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    נסרקו {topSenders.totalScanned} הודעות
                  </span>
                  {topSenders.continueToken && (
                    <button
                      onClick={() => handleTopSenders(topSenders.continueToken)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                      }}
                    >
                      סרוק עוד 2000
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Event scan modal */}
      {eventScan.step !== 'idle' && (
        <div
          onClick={() => setEventScan({ step: 'idle' })}
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
              <div style={{ fontWeight: 600 }}>ניקוי אירועים שחלפו</div>
              <button
                onClick={() => setEventScan({ step: 'idle' })}
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
            {eventScan.step === 'scanning' ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#1e40af' }}>
                {eventScan.progress}
              </div>
            ) : eventScan.step === 'deleting' ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
                מוחק הודעות...
              </div>
            ) : eventScan.step === 'review' && eventScan.events.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ color: '#6b7280', marginBottom: '1rem' }}>לא נמצאו אירועים שחלפו</div>
                <button
                  onClick={() => setEventScan({ step: 'idle' })}
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
            ) : eventScan.step === 'review' ? (
              <>
                {/* Summary bar */}
                <div style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                  background: '#f9fafb',
                }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    נמצאו {eventScan.events.length} אירועים שחלפו
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {eventScan.events.filter(e => e.selected).length} נבחרו
                    </span>
                    <button
                      onClick={() => setEventScan(prev => prev.step === 'review' ? { ...prev, events: prev.events.map(e => ({ ...e, selected: true })) } : prev)}
                      style={{ padding: '0.25rem 0.5rem', background: 'none', border: '1px solid #d1d5db', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      בחר הכל
                    </button>
                    <button
                      onClick={() => setEventScan(prev => prev.step === 'review' ? { ...prev, events: prev.events.map(e => ({ ...e, selected: false })) } : prev)}
                      style={{ padding: '0.25rem 0.5rem', background: 'none', border: '1px solid #d1d5db', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      בטל הכל
                    </button>
                  </div>
                </div>

                {/* Events list */}
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  {eventScan.events.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setEventScan(prev => prev.step === 'review' ? {
                        ...prev,
                        events: prev.events.map(e => e.id === ev.id ? { ...e, selected: !e.selected } : e),
                      } : prev)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        background: ev.selected ? '#eff6ff' : 'white',
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: '1.25rem',
                        height: '1.25rem',
                        borderRadius: '0.25rem',
                        border: `2px solid ${ev.selected ? '#3b82f6' : '#d1d5db'}`,
                        background: ev.selected ? '#3b82f6' : 'white',
                        flexShrink: 0,
                        marginTop: '0.125rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}>
                        {ev.selected && '\u2713'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.subject}
                        </div>
                        {ev.eventDescription && (
                          <div style={{ fontSize: '0.8rem', color: '#7c3aed', marginTop: '0.125rem' }}>
                            {ev.eventDescription}
                          </div>
                        )}
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                          {formatSender(ev.from)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.125rem' }}>
                          האירוע היה ב-{new Date(ev.eventDate + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div style={{
                  padding: '0.75rem 1rem',
                  borderTop: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {eventScan.events.filter(e => e.selected).length} הודעות יימחקו
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setEventScan({ step: 'idle' })}
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
                    <button
                      onClick={handleEventDelete}
                      disabled={eventScan.events.filter(e => e.selected).length === 0}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: eventScan.events.filter(e => e.selected).length === 0 ? 'default' : 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        opacity: eventScan.events.filter(e => e.selected).length === 0 ? 0.5 : 1,
                      }}
                    >
                      מחק ({eventScan.events.filter(e => e.selected).length})
                    </button>
                  </div>
                </div>
              </>
            ) : null}
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
