'use client'

import { useState, useEffect } from 'react'
import Modal from '@/app/components/Modal'
import { taskSubjectStore } from '@/app/stores/taskSubjectStore'
import { todoStore } from '@/app/stores/todoStore'
import type { SubjectData } from '@/app/types/subject'
import type { CombinedTask } from './TaskCard'
import SubjectEditorModal from './SubjectEditorModal'
import ComposeApplicationModal from './ComposeApplicationModal'

type Props = {
  task: CombinedTask | null
  onClose: () => void
  onUpdate?: () => void
}

const STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  reviewing: 'בבדיקה',
  applying: 'בתהליך הגשה',
  sent: 'נשלח',
  rejected: 'נדחה',
  accepted: 'התקבל',
}

export default function TaskDetailModal({ task, onClose, onUpdate }: Props) {
  const [subjectData, setSubjectData] = useState<SubjectData | null>(null)
  const [showSubjectEditor, setShowSubjectEditor] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [deadline, setDeadline] = useState('')
  const [snoozedUntil, setSnoozedUntil] = useState('')

  useEffect(() => {
    if (task?.subject) {
      taskSubjectStore.get(task.subject).then(setSubjectData)
    } else {
      setSubjectData(null)
    }
  }, [task?.subject])

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setDeadline(task.deadline ? task.deadline.split('T')[0] : '')
      setSnoozedUntil(task.snoozedUntil ? task.snoozedUntil.split('T')[0] : '')
    }
  }, [task])

  if (!task) return null

  const isUserTask = task.taskType === 'user'

  async function saveField(field: 'deadline' | 'snoozedUntil', value: string) {
    if (!task || !isUserTask || typeof task.id !== 'number') return
    const update = value ? { [field]: new Date(value).toISOString() } : { [field]: undefined }
    await todoStore.updateTask(task.id, update)
    onUpdate?.()
  }

  // If compose modal is open, show that instead
  if (showCompose && task.subject) {
    return (
      <ComposeApplicationModal
        task={task}
        subjectName={task.subject}
        onClose={() => setShowCompose(false)}
      />
    )
  }

  const ext = task.ext?.kind === 'lead' ? task.ext : null
  const isApplication = subjectData?.type === 'application'
  const hasProfile = isApplication && !!subjectData?.application?.fullName

  return (
    <>
      <Modal isOpen={!!task} onClose={onClose} maxWidth="500px">
        <div dir="rtl" style={{ padding: '0.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>{task.title}</h3>

          {/* Subject + actions */}
          {task.subject && (
            <div style={{
              display: 'flex', gap: '0.5rem', alignItems: 'center',
              marginBottom: '1rem', flexWrap: 'wrap',
            }}>
              <Tag color="#7c3aed" bg="#ede9fe" label={task.subject} />
              <button onClick={() => setShowSubjectEditor(true)} style={linkBtn}>
                הגדרות נושא
              </button>
              {hasProfile && ext && (
                <button
                  onClick={() => setShowCompose(true)}
                  style={{
                    padding: '0.375rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem',
                    border: '1px solid #86efac', background: '#dcfce7', color: '#16a34a',
                    cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  חבר מכתב
                </button>
              )}
              {!hasProfile && ext && (
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                  הגדר פרופיל כדי לחבר מכתב
                </span>
              )}
            </div>
          )}

          {/* Editable fields for user tasks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <Label>📅 דדליין</Label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {isUserTask ? (
                  <>
                    <input
                      type="date"
                      value={deadline}
                      onChange={e => {
                        setDeadline(e.target.value)
                        saveField('deadline', e.target.value)
                      }}
                      style={inputStyle}
                    />
                    {deadline && (
                      <button
                        onClick={() => { setDeadline(''); saveField('deadline', '') }}
                        style={{ ...clearBtn }}
                        title="נקה דדליין"
                      >
                        ✕
                      </button>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                    {task.deadline ? new Date(task.deadline).toLocaleDateString('he-IL') : 'לא הוגדר'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <Label>😴 מוסתר עד</Label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {isUserTask ? (
                  <>
                    <input
                      type="date"
                      value={snoozedUntil}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => {
                        setSnoozedUntil(e.target.value)
                        saveField('snoozedUntil', e.target.value)
                      }}
                      style={inputStyle}
                    />
                    {snoozedUntil && (
                      <button
                        onClick={() => { setSnoozedUntil(''); saveField('snoozedUntil', '') }}
                        style={{ ...clearBtn }}
                        title="בטל הסתרה"
                      >
                        ✕
                      </button>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                    {task.snoozedUntil ? new Date(task.snoozedUntil).toLocaleDateString('he-IL') : 'לא מוסתר'}
                  </span>
                )}
              </div>
            </div>

            {/* Tags */}
            {task.tags && task.tags.length > 0 && (
              <div>
                <Label>תגיות</Label>
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  {task.tags.map(t => <Tag key={t} color="#7c3aed" bg="#ede9fe" label={t} />)}
                </div>
              </div>
            )}
          </div>

          {/* Lead-specific details */}
          {ext && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {ext.applicationStatus && (
                <Row label="סטטוס" value={STATUS_LABELS[ext.applicationStatus] || ext.applicationStatus} />
              )}
              {ext.links.length > 0 && (
                <div>
                  <Label>קישורים</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {ext.links.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#3b82f6', fontSize: '0.85rem', wordBreak: 'break-all', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                        🔗 {link.text || link.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {ext.address && <Row label="כתובת" value={ext.address} />}
              {ext.phone && <Row label="טלפון" value={ext.phone} />}
              {ext.leadTags && ext.leadTags.length > 0 && (
                <div>
                  <Label>תגיות</Label>
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                    {ext.leadTags.map(t => <Tag key={t} color="#374151" bg="#e0e7ff" label={t} />)}
                  </div>
                </div>
              )}
              {ext.notes && (
                <div>
                  <Label>הערות</Label>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>{ext.notes}</p>
                </div>
              )}
            </div>
          )}

          {!ext && !isUserTask && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
              משימה אוטומטית
            </p>
          )}

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-start' }}>
            <button onClick={onClose} style={{
              padding: '0.6rem 1.25rem', background: '#f1f5f9',
              border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer',
            }}>
              סגור
            </button>
          </div>
        </div>
      </Modal>

      {/* Subject editor modal */}
      <SubjectEditorModal
        subjectName={showSubjectEditor ? task.subject || null : null}
        onClose={() => setShowSubjectEditor(false)}
        onSaved={() => {
          if (task.subject) taskSubjectStore.get(task.subject).then(setSubjectData)
        }}
      />
    </>
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

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#3b82f6',
  cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline', padding: 0,
}

const inputStyle: React.CSSProperties = {
  padding: '0.375rem 0.5rem',
  fontSize: '0.85rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  cursor: 'pointer',
}

const clearBtn: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '0.25rem',
  color: '#dc2626',
  cursor: 'pointer',
  fontSize: '0.75rem',
  padding: '0.25rem 0.4rem',
  lineHeight: 1,
}
