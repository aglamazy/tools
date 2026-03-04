'use client'

import { useState, useEffect, useCallback } from 'react'
import { scoutResultStore } from '@/app/stores/scoutResultStore'
import { scoutConfigStore } from '@/app/stores/scoutConfigStore'
import type { ScoutResult, ScoutResultStatus } from '@/app/types/scoutResult'
import ScoutChatDialog from './ScoutChatDialog'

type AuditionsTabProps = {
  businessId: number
}

const STATUS_LABELS: Record<ScoutResultStatus, string> = {
  new: 'חדש',
  useful: 'שימושי',
  not_useful: 'לא רלוונטי',
  apply: 'להגיש',
  not_yet: 'עוד לא',
  not_available: 'לא זמין',
}

const STATUS_COLORS: Record<ScoutResultStatus, string> = {
  new: '#2196F3',
  useful: '#4CAF50',
  not_useful: '#9E9E9E',
  apply: '#FF9800',
  not_yet: '#FFC107',
  not_available: '#F44336',
}

const FILTER_OPTIONS: { value: ScoutResultStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'new', label: 'חדש' },
  { value: 'useful', label: 'שימושי' },
  { value: 'apply', label: 'להגיש' },
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
  const [results, setResults] = useState<ScoutResult[]>([])
  const [filter, setFilter] = useState<ScoutResultStatus | 'all'>('all')
  const [chatOpen, setChatOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadResults = useCallback(async () => {
    setLoading(true)
    const all = await scoutResultStore.getByBusinessId(businessId)
    setResults(all)
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    void loadResults()
  }, [loadResults])

  const filteredResults = filter === 'all'
    ? results
    : results.filter(r => r.status === filter)

  const handleStatusUpdate = async (id: number, status: ScoutResultStatus) => {
    const ok = await scoutResultStore.updateStatus(id, status)
    if (ok) {
      setResults(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    }
  }

  const handleManualSearch = async () => {
    setSearching(true)
    try {
      const config = await scoutConfigStore.getByBusinessId(businessId)
      if (!config?.config || Object.keys(config.config).length === 0) {
        setChatOpen(true)
        setSearching(false)
        return
      }

      const params = new URLSearchParams({
        businessId: String(businessId),
        config: JSON.stringify(config.config),
      })

      const response = await fetch(`/api/scout/run?${params}`)
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

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Action bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleManualSearch}
          disabled={searching}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent-color, #007bff)',
            color: '#fff',
            cursor: searching ? 'not-allowed' : 'pointer',
            opacity: searching ? 0.6 : 1,
          }}
        >
          {searching ? 'מחפש...' : '🔍 חפש עכשיו'}
        </button>
        <button
          onClick={() => setChatOpen(true)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #ddd)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          ⚙️ הגדרות חיפוש
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '16px',
              border: filter === opt.value ? '2px solid var(--accent-color, #007bff)' : '1px solid var(--border-color, #ddd)',
              background: filter === opt.value ? 'var(--accent-color, #007bff)' : 'transparent',
              color: filter === opt.value ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#888' }}>טוען...</p>
      ) : filteredResults.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
          {results.length === 0
            ? 'אין תוצאות עדיין. הגדר חיפוש ולחץ "חפש עכשיו"'
            : 'אין תוצאות בסינון הנוכחי'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredResults.map(result => (
            <div key={result.id} style={{
              border: '1px solid var(--border-color, #ddd)',
              borderRadius: '8px',
              padding: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>
                    {result.url ? (
                      <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color, #007bff)', textDecoration: 'none' }}>
                        {result.title}
                      </a>
                    ) : result.title}
                  </h3>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem', color: '#666' }}>
                    {result.summary}
                  </p>
                  {result.deadline && (
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem' }}>
                      <strong>דדליין:</strong> {result.deadline}
                    </p>
                  )}
                  {result.details && (
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', color: '#555' }}>
                      {result.details}
                    </p>
                  )}
                  {result.source && (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#999' }}>
                      מקור: {result.source}
                    </p>
                  )}
                </div>
                <span style={{
                  padding: '0.15rem 0.5rem',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  color: '#fff',
                  background: STATUS_COLORS[result.status],
                  whiteSpace: 'nowrap',
                }}>
                  {STATUS_LABELS[result.status]}
                </span>
              </div>

              {/* Feedback buttons */}
              <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {FEEDBACK_BUTTONS.map(btn => (
                  <button
                    key={btn.status}
                    onClick={() => result.id && handleStatusUpdate(result.id, btn.status)}
                    title={btn.label}
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '6px',
                      border: result.status === btn.status ? '2px solid var(--accent-color, #007bff)' : '1px solid var(--border-color, #ddd)',
                      background: result.status === btn.status ? 'var(--accent-light, #e3f2fd)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
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

      <ScoutChatDialog
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        businessId={businessId}
        onConfigSaved={loadResults}
      />
    </div>
  )
}
