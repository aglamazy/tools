'use client'

import Modal from '@/app/components/Modal'
import type { CheckedCandidate } from '@/app/services/receiptMatchService'

type SearchResultsModalProps = {
  candidates: CheckedCandidate[]
  onClose: () => void
}

export default function SearchResultsModal({ candidates, onClose }: SearchResultsModalProps) {
  return (
    <Modal isOpen onClose={onClose} maxWidth="650px">
      <div className="modal-header">
        <h2>מיילים שנבדקו ({candidates.length})</h2>
      </div>
      <div className="modal-body">
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
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
