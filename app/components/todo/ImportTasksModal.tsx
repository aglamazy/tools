'use client'

import { useState, useRef } from 'react'
import Modal from '@/app/components/Modal'
import { todoStore, type EisenhowerQuadrant } from '@/app/stores/todoStore'
import { parseDocxToLeads, type LeadEntry } from '@/app/services/scholarshipParserService'
import { getLLMClient } from '@/app/services/llm'

type ImportType = 'task-list' | 'leads'
type Relevance = 'relevant' | 'unknown' | 'rejected'
type ParsedLead = LeadEntry & { selected: boolean; relevance?: Relevance; reason?: string }
type ParsedLine = { text: string; selected: boolean }

const QUADRANT_OPTIONS: { key: EisenhowerQuadrant; label: string; icon: string }[] = [
  { key: 'do', label: 'עשה עכשיו', icon: '🔥' },
  { key: 'schedule', label: 'תכנן', icon: '📅' },
  { key: 'delegate', label: 'האצל', icon: '👥' },
  { key: 'eliminate', label: 'בהמשך', icon: '📌' },
]

const RELEVANCE_CONFIG: Record<Relevance, { icon: string; color: string; bg: string }> = {
  relevant: { icon: '🟢', color: '#059669', bg: '#ecfdf5' },
  unknown: { icon: '🟡', color: '#d97706', bg: '#fffbeb' },
  rejected: { icon: '⚪', color: '#6b7280', bg: '#f9fafb' },
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onImported: (count: number) => void
}

export default function ImportTasksModal({ isOpen, onClose, onImported }: Props) {
  const [importType, setImportType] = useState<ImportType>('leads')
  const [quadrant, setQuadrant] = useState<EisenhowerQuadrant>('schedule')
  const [parsing, setParsing] = useState(false)
  const [parseStep, setParseStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [subject, setSubject] = useState('')
  const [filterQuery, setFilterQuery] = useState('')
  const [filtering, setFiltering] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [leads, setLeads] = useState<ParsedLead[]>([])
  const [lines, setLines] = useState<ParsedLine[]>([])
  const [fileName, setFileName] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setLeads([])
    setLines([])
    setFileName(null)
    setSubject('')
    setFilterQuery('')
    setPreviewUrl(null)
    setError(null)
    setParsing(false)
    setParseStep('')
    setImporting(false)
    setFiltering(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => { reset(); onClose() }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSubject(file.name.replace(/\.[^.]+$/, ''))
    setError(null)

    if (importType === 'task-list') {
      const text = await file.text()
      const parsed = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      if (parsed.length === 0) { setError('הקובץ ריק'); return }
      setLines(parsed.map(text => ({ text, selected: true })))
    } else {
      setParsing(true)
      setParseStep('קורא קובץ...')
      try {
        const buffer = await file.arrayBuffer()
        const result = await parseDocxToLeads(buffer, setParseStep)
        if (result.leads.length === 0) { setError('לא נמצאו פריטים בקובץ'); setParsing(false); return }
        setLeads(result.leads.map(s => ({ ...s, selected: true })))
      } catch (err: any) {
        console.error('[ImportTasks] Parse error:', err)
        setError(err.message || 'שגיאה בעיבוד הקובץ')
      }
      setParsing(false)
    }
  }

  const handleAIFilter = async () => {
    if (!filterQuery.trim() || leads.length === 0) return
    setFiltering(true)
    setError(null)

    try {
      const descriptions = leads.map(l => {
        const parts = [l.name]
        if (l.notes) parts.push(`notes: ${l.notes}`)
        if (l.tags.length) parts.push(`tags: ${l.tags.join(', ')}`)
        if (l.category) parts.push(`section: ${l.category}`)
        if (l.address) parts.push(`addr: ${l.address}`)
        // URLs often reveal the domain (musik, kultur, etc.)
        for (const link of l.links.slice(0, 2)) {
          parts.push(`url: ${link.url}`)
        }
        return parts.join(' | ')
      })

      const llm = getLLMClient('gemini')
      const result = await llm.chat({
        system: `You classify leads/items by relevance to a user's search.
You are given foundation/scholarship names with metadata (notes, tags, URLs, addresses).
Use ALL available signals — the name, URL domain, notes, tags — to infer what each foundation supports.
For example: "Musik" in the name/URL → music-related. "PO" tag → project oriented. "IO" tag → instrument oriented.

For each item return: {"r": "relevant"|"unknown"|"rejected", "why": "brief reason (5-10 words)"}
- "relevant" = likely matches based on available clues
- "rejected" = clearly does NOT match (e.g. wrong field, in liquidation, not relevant note)
- "unknown" = genuinely cannot tell from available info
Bias toward "relevant" or "rejected" when there are clues. Use "unknown" sparingly.
Return a JSON array of exactly ${descriptions.length} objects. No extra text.`,
        messages: [{
          role: 'user',
          content: `Looking for: "${filterQuery}"\n\n${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`,
        }],
        maxTokens: 4000,
      })

      if (result.error) { setError(`AI: ${result.error}`); setFiltering(false); return }

      let jsonStr = result.text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
      const start = jsonStr.indexOf('[')
      const end = jsonStr.lastIndexOf(']')
      if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1)

      const raw: unknown[] = JSON.parse(jsonStr)
      console.log('[ImportTasks] AI classifications:', raw.slice(0, 3))
      setLeads(leads.map((lead, i) => {
        const item = raw[i]
        let r: Relevance = 'unknown'
        let reason = ''
        if (typeof item === 'string') {
          r = (['relevant', 'unknown', 'rejected'].includes(item) ? item : 'unknown') as Relevance
        } else if (item && typeof item === 'object') {
          const obj = item as Record<string, string>
          r = (['relevant', 'unknown', 'rejected'].includes(obj.r) ? obj.r : 'unknown') as Relevance
          reason = obj.why || obj.reason || ''
        }
        return { ...lead, relevance: r, reason, selected: r !== 'rejected' }
      }))
    } catch (err: any) {
      console.error('[ImportTasks] AI filter error:', err)
      setError('שגיאה בסינון AI')
    }
    setFiltering(false)
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      let count = 0
      const sub = subject.trim() || undefined
      if (importType === 'leads') {
        const selected = leads.filter(l => l.selected)
        count = await todoStore.importLeads(
          selected.map(l => ({
            name: l.name,
            deadline: l.deadline || undefined,
            links: l.links,
            address: l.address || undefined,
            tags: l.tags,
            status: l.status || undefined,
            notes: l.notes || undefined,
            phone: l.phone,
            priority: l.relevance === 'relevant' ? 'high' as const : l.relevance === 'rejected' ? 'low' as const : undefined,
          })),
          quadrant, sub,
        )
      } else {
        const selected = lines.filter(l => l.selected)
        count = await todoStore.importTaskList(selected.map(l => l.text), quadrant, sub)
      }
      onImported(count)
      handleClose()
    } catch (err: any) {
      console.error('[ImportTasks] Import error:', err)
      setError(err.message || 'שגיאה בייבוא')
    }
    setImporting(false)
  }

  const toggleAll = (selected: boolean) => {
    if (importType === 'leads') setLeads(leads.map(l => ({ ...l, selected })))
    else setLines(lines.map(l => ({ ...l, selected })))
  }

  const items = importType === 'leads' ? leads : lines
  const selectedCount = items.filter(i => i.selected).length
  const hasItems = items.length > 0

  return (
    <Modal isOpen={isOpen} onClose={handleClose} maxWidth={previewUrl ? '1100px' : '550px'}>
      <div dir="rtl" style={{ padding: '0.5rem' }}>
        <h3 style={{ margin: '0 0 1.5rem', textAlign: 'center', fontSize: '1.1rem' }}>ייבוא משימות מקובץ</h3>

        {/* Type selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <select
            value={importType}
            onChange={(e) => { setImportType(e.target.value as ImportType); reset() }}
            style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
          >
            <option value="leads">לידים (docx)</option>
            <option value="task-list">רשימת משימות (txt)</option>
          </select>
        </div>

        {/* File picker */}
        <div style={{ marginBottom: '1rem' }}>
          <input ref={fileRef} type="file" accept={importType === 'leads' ? '.docx' : '.txt,.csv'} onChange={handleFileChange} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} className="file-picker" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            {fileName || (importType === 'leads' ? 'בחר קובץ docx' : 'בחר קובץ txt')}
          </button>
        </div>

        {/* Parsing indicator */}
        {parsing && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            <div style={{ width: '2rem', height: '2rem', margin: '0 auto 0.75rem', border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            {parseStep || 'מעבד את הקובץ...'}
          </div>
        )}

        {error && (
          <div style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: '0.375rem', background: '#fef2f2', color: '#dc2626', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Preview + options */}
        {hasItems && !parsing && (
          <>
            {/* Subject */}
            <div style={{ marginBottom: '0.75rem' }}>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="נושא (לסינון בלוח)"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
            </div>

            {/* AI filter — leads only */}
            {importType === 'leads' && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAIFilter()}
                  placeholder="מה אתה מחפש? (לסינון AI)"
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
                />
                <button
                  onClick={handleAIFilter}
                  disabled={!filterQuery.trim() || filtering}
                  style={{
                    padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem',
                    border: '1px solid #c4b5fd', background: '#ede9fe', color: '#7c3aed',
                    cursor: filterQuery.trim() && !filtering ? 'pointer' : 'not-allowed',
                    opacity: filtering ? 0.7 : 1, whiteSpace: 'nowrap',
                  }}
                >
                  {filtering ? 'מסנן...' : 'סנן AI'}
                </button>
              </div>
            )}

            {/* Selection controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
              <span>{selectedCount} / {items.length} נבחרו</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => toggleAll(true)} style={linkBtnStyle}>בחר הכל</button>
                <button onClick={() => toggleAll(false)} style={linkBtnStyle}>נקה הכל</button>
              </div>
            </div>

            {/* Items list + iframe preview */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              {/* List */}
              <div style={{ flex: 1, maxHeight: '400px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '0.375rem', minWidth: 0 }}>
                {importType === 'leads' ? leads.map((lead, i) => {
                  const rel = lead.relevance ? RELEVANCE_CONFIG[lead.relevance] : null
                  return (
                    <label key={i} style={{
                      display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem',
                      borderBottom: i < leads.length - 1 ? '1px solid #f3f4f6' : 'none',
                      cursor: 'pointer', alignItems: 'flex-start',
                      background: rel?.bg || (lead.selected ? 'white' : '#f9fafb'),
                    }}>
                      <input type="checkbox" checked={lead.selected} onChange={() => setLeads(leads.map((l, j) => j === i ? { ...l, selected: !l.selected } : l))} style={{ marginTop: '0.2rem' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                          {rel && <span style={{ marginLeft: '0.25rem' }}>{rel.icon}</span>}
                          {lead.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {lead.deadline && <span>📅 {lead.deadline}</span>}
                          {lead.links.length > 0 && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewUrl(lead.links[0].url) }}
                              style={{ ...linkBtnStyle, fontSize: '0.75rem', color: '#3b82f6' }}>
                              🔗 {lead.links.length > 1 ? `${lead.links.length} קישורים` : 'קישור'}
                            </button>
                          )}
                          {lead.status === 'sent' && <span style={{ color: '#059669' }}>✓ נשלח</span>}
                          {lead.tags?.map(t => <span key={t} style={{ background: '#e0e7ff', padding: '0 0.25rem', borderRadius: '0.125rem' }}>{t}</span>)}
                        </div>
                        {lead.reason && (
                          <div style={{ fontSize: '0.7rem', color: rel?.color || '#6b7280', marginTop: '0.125rem', fontStyle: 'italic' }}>
                            {lead.reason}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                }) : lines.map((line, i) => (
                  <label key={i} style={{
                    display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem',
                    borderBottom: i < lines.length - 1 ? '1px solid #f3f4f6' : 'none',
                    cursor: 'pointer', background: line.selected ? 'white' : '#f9fafb',
                  }}>
                    <input type="checkbox" checked={line.selected} onChange={() => setLines(lines.map((l, j) => j === i ? { ...l, selected: !l.selected } : l))} />
                    <span style={{ fontSize: '0.875rem' }}>{line.text}</span>
                  </label>
                ))}
              </div>

              {/* Iframe preview */}
              {previewUrl && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '0.75rem', color: '#3b82f6', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {previewUrl}
                    </a>
                    <button onClick={() => setPreviewUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#6b7280' }}>✕</button>
                  </div>
                  <iframe
                    src={previewUrl}
                    style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '0.375rem', minHeight: '350px' }}
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              )}
            </div>

            {/* Quadrant */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#374151' }}>רביע:</span>
              <select value={quadrant} onChange={(e) => setQuadrant(e.target.value as EisenhowerQuadrant)}
                style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem' }}>
                {QUADRANT_OPTIONS.map(q => <option key={q.key} value={q.key}>{q.icon} {q.label}</option>)}
              </select>
            </div>
          </>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
          <button onClick={handleImport} disabled={!hasItems || selectedCount === 0 || importing || parsing}
            style={{
              padding: '0.6rem 1.25rem', background: hasItems && selectedCount > 0 ? '#3b82f6' : '#94a3b8',
              color: 'white', border: 'none', borderRadius: '0.375rem',
              cursor: hasItems && selectedCount > 0 ? 'pointer' : 'not-allowed', fontWeight: 500, opacity: importing ? 0.7 : 1,
            }}>
            {importing ? 'מייבא...' : `ייבא ${selectedCount > 0 ? `(${selectedCount})` : ''}`}
          </button>
          <button onClick={handleClose} style={{ padding: '0.6rem 1.25rem', background: '#f1f5f9', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer' }}>
            ביטול
          </button>
        </div>
      </div>
    </Modal>
  )
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#3b82f6',
  cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline', padding: 0,
}
