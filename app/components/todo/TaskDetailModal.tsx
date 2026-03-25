'use client'

import Modal from '@/app/components/Modal'
import type { CombinedTask } from './TaskCard'

type Props = {
  task: CombinedTask | null
  onClose: () => void
}

const STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  reviewing: 'בבדיקה',
  applying: 'בתהליך הגשה',
  sent: 'נשלח',
  rejected: 'נדחה',
  accepted: 'התקבל',
}

export default function TaskDetailModal({ task, onClose }: Props) {
  if (!task) return null
  const ext = task.ext?.kind === 'lead' ? task.ext : null

  return (
    <Modal isOpen={!!task} onClose={onClose} maxWidth="500px">
      <div dir="rtl" style={{ padding: '0.5rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>{task.title}</h3>

        {/* Common task info */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {task.deadline && (
            <Tag color="#2563eb" bg="#eff6ff" label={`📅 ${task.deadline}`} />
          )}
          {task.tags?.map(t => (
            <Tag key={t} color="#7c3aed" bg="#ede9fe" label={t} />
          ))}
        </div>

        {/* Lead-specific details */}
        {ext && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Application status */}
            {ext.applicationStatus && (
              <Row label="סטטוס" value={STATUS_LABELS[ext.applicationStatus] || ext.applicationStatus} />
            )}

            {/* Links */}
            {ext.links.length > 0 && (
              <div>
                <Label>קישורים</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {ext.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#3b82f6', fontSize: '0.85rem', wordBreak: 'break-all',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      🔗 {link.text || link.url}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Address */}
            {ext.address && <Row label="כתובת" value={ext.address} />}

            {/* Phone */}
            {ext.phone && <Row label="טלפון" value={ext.phone} />}

            {/* Lead tags */}
            {ext.leadTags && ext.leadTags.length > 0 && (
              <div>
                <Label>תגיות</Label>
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  {ext.leadTags.map(t => (
                    <Tag key={t} color="#374151" bg="#e0e7ff" label={t} />
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {ext.notes && (
              <div>
                <Label>הערות</Label>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>
                  {ext.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Non-lead tasks — just show basic info */}
        {!ext && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
            {task.taskType === 'auto' ? 'משימה אוטומטית' : 'משימה אישית'}
          </p>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-start' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.6rem 1.25rem', background: '#f1f5f9',
              border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer',
            }}
          >
            סגור
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, marginBottom: '0.25rem' }}>{children}</div>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <span style={{ fontSize: '0.85rem', color: '#374151' }}>{value}</span>
    </div>
  )
}

function Tag({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{
      fontSize: '0.75rem', padding: '0.125rem 0.5rem',
      borderRadius: '0.25rem', background: bg, color, fontWeight: 500,
    }}>
      {label}
    </span>
  )
}
