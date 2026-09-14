'use client'

import Modal from '@/app/components/Modal'
import type { CheckedCandidate, SearchInfo } from '@/app/services/receiptMatchService'

type SearchResultsModalProps = {
  candidates: CheckedCandidate[]
  searchInfo?: SearchInfo | null
  onClose: () => void
  onPick?: (candidate: CheckedCandidate) => void
  pickingId?: string | null
}

export default function SearchResultsModal({ candidates, searchInfo, onClose, onPick, pickingId }: SearchResultsModalProps) {
  return (
    <Modal isOpen onClose={onClose} maxWidth="650px">
      <div className="modal-header">
        <h2>מיילים שנבדקו ({candidates.length})</h2>
      </div>
      <div className="modal-body">
        {searchInfo && (
          <div style={{ fontSize: '0.8rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <strong>מאת:</strong>{' '}
              {searchInfo.senders.length > 0 ? searchInfo.senders.join(' · ') : <span style={{ color: '#b45309' }}>לא הוגדרה כתובת מייל לספק</span>}
            </div>
            <div><strong>טווח תאריכים:</strong> {searchInfo.dateRange}</div>
          </div>
        )}
        {candidates.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>
            לא נמצא אף מייל תואם לחיפוש — לא היה מה לבדוק.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
            {candidates.map((c) => (
              <div
                key={c.messageId}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: `1px solid ${c.outcome === 'matched' ? '#86efac' : '#e5e7eb'}`,
                  background: c.outcome === 'matched' ? '#f0fdf4' : '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.subject || '(ללא נושא)'}</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: c.outcome === 'matched' ? '#166534' : '#b45309',
                      background: c.outcome === 'matched' ? '#dcfce7' : '#fef3c7',
                      borderRadius: '999px',
                      padding: '0.1rem 0.6rem',
                    }}
                  >
                    {c.outcome === 'matched' ? 'נמצאה התאמה' : 'נדחה'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.15rem' }}>
                  {c.from} · {c.date}
                </div>
                {c.reason && (
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                    {c.reason}
                  </div>
                )}
                {c.outcome === 'rejected' && onPick && (
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    disabled={pickingId === c.messageId}
                    title="בדוק את המייל הזה ישירות, בלי סינון הנושא האוטומטי"
                    style={{
                      marginTop: '0.4rem',
                      padding: '0.15rem 0.6rem',
                      background: pickingId === c.messageId ? '#f1f5f9' : '#eff6ff',
                      color: '#1e40af',
                      border: '1px solid #bfdbfe',
                      borderRadius: '0.375rem',
                      cursor: pickingId === c.messageId ? 'default' : 'pointer',
                      fontSize: '0.75rem',
                    }}
                  >
                    {pickingId === c.messageId ? 'בודק…' : 'זה המסמך — בדוק ידנית'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
