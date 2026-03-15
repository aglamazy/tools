'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { db, type BusinessTask, type RecurrenceType } from '@/app/db/financeDB'
import { uploadTaxDocument } from '@/app/services/googleDriveService'
import { getAccessToken } from '@/app/services/googleTokenService'
import YesNoModal from '@/app/components/YesNoModal'

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  monthly: 'חודשי',
  weekly: 'שבועי',
  yearly: 'שנתי',
  once: 'חד פעמי',
}

const PRIORITY_CONFIG = {
  high: { label: '🔥 עשה עכשיו', color: '#dc2626', bg: '#fef2f2' },
  medium: { label: '📅 תזמן', color: '#2563eb', bg: '#eff6ff' },
  low: { label: '📋 רגיל', color: '#6b7280', bg: '#f9fafb' },
}

const DAY_OF_WEEK = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function getNextDueDate(task: BusinessTask): Date | null {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  switch (task.recurrence) {
    case 'monthly': {
      const day = task.dueDay || 1
      let due = new Date(y, m, day)
      if (due < now) due = new Date(y, m + 1, day)
      return due
    }
    case 'weekly': {
      const targetDay = task.dueDay ?? 0
      const currentDay = now.getDay()
      let daysUntil = targetDay - currentDay
      if (daysUntil <= 0) daysUntil += 7
      const due = new Date(now)
      due.setDate(due.getDate() + daysUntil)
      due.setHours(0, 0, 0, 0)
      return due
    }
    case 'yearly': {
      const day = task.dueDay || 1
      const month = (task.dueMonth || 1) - 1
      let due = new Date(y, month, day)
      if (due < now) due = new Date(y + 1, month, day)
      return due
    }
    case 'once': {
      if (task.completed) return null
      const day = task.dueDay || now.getDate()
      const month = (task.dueMonth || (m + 1)) - 1
      return new Date(y, month, day)
    }
  }
}

function formatDueDescription(task: BusinessTask): string {
  switch (task.recurrence) {
    case 'monthly':
      return `כל חודש עד ה-${task.dueDay || 1}`
    case 'weekly':
      return `כל שבוע ביום ${DAY_OF_WEEK[task.dueDay ?? 0]}`
    case 'yearly':
      return `כל שנה, ${task.dueDay || 1}/${task.dueMonth || 1}`
    case 'once':
      return task.completed ? 'הושלם' : `עד ${task.dueDay || '?'}/${task.dueMonth || '?'}`
  }
}

function formatNextDue(task: BusinessTask): { text: string; color: string } {
  const due = getNextDueDate(task)
  if (!due) return { text: 'הושלם', color: '#16a34a' }

  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { text: `באיחור ${Math.abs(diffDays)} ימים`, color: '#dc2626' }
  if (diffDays === 0) return { text: 'היום!', color: '#dc2626' }
  if (diffDays === 1) return { text: 'מחר', color: '#f97316' }
  if (diffDays <= 3) return { text: `בעוד ${diffDays} ימים`, color: '#f97316' }
  if (diffDays <= 7) return { text: `בעוד ${diffDays} ימים`, color: '#2563eb' }
  return { text: due.toLocaleDateString('he-IL'), color: '#6b7280' }
}

type EditingTask = Omit<BusinessTask, 'id' | 'syncId' | 'createdAt' | 'updatedAt'> & { id?: number }

export default function BusinessTasksTab({ businessId }: { businessId: number }) {
  const [tasks, setTasks] = useState<BusinessTask[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditingTask | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [driveConnected, setDriveConnected] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; task: BusinessTask | null }>({ isOpen: false, task: null })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadTasks = useCallback(async () => {
    const all = await db.businessTasks.where('businessId').equals(businessId).toArray()
    const active = all.filter(t => !t.archived)
    active.sort((a, b) => {
      // Sort by priority (high first), then by next due date
      const pv = (p: string) => p === 'high' ? 3 : p === 'medium' ? 2 : 1
      const pd = pv(b.priority) - pv(a.priority)
      if (pd !== 0) return pd
      const aDate = getNextDueDate(a)
      const bDate = getNextDueDate(b)
      if (aDate && bDate) return aDate.getTime() - bDate.getTime()
      return 0
    })
    setTasks(active)
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    loadTasks()
    getAccessToken().then(token => setDriveConnected(!!token))
  }, [loadTasks])

  const handleAdd = () => {
    setEditing({
      businessId,
      title: '',
      recurrence: 'monthly',
      dueDay: 15,
      reminderDaysBefore: 3,
      priority: 'high',
    })
    setIsNew(true)
  }

  const handleEdit = (task: BusinessTask) => {
    setEditing({ ...task })
    setIsNew(false)
  }

  const handleSave = async () => {
    if (!editing || !editing.title.trim()) return
    const now = new Date().toISOString()

    if (isNew) {
      await db.businessTasks.add({
        ...editing,
        title: editing.title.trim(),
        description: editing.description?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      })
    } else if (editing.id) {
      await db.businessTasks.update(editing.id, {
        title: editing.title.trim(),
        description: editing.description?.trim() || undefined,
        recurrence: editing.recurrence,
        dueDay: editing.dueDay,
        dueMonth: editing.dueMonth,
        reminderDaysBefore: editing.reminderDaysBefore,
        priority: editing.priority,
        attachmentDriveFileId: editing.attachmentDriveFileId,
        attachmentDriveWebViewLink: editing.attachmentDriveWebViewLink,
        attachmentFileName: editing.attachmentFileName,
        completed: editing.completed,
        updatedAt: now,
      })
    }
    setEditing(null)
    await loadTasks()
  }

  const handleDelete = (task: BusinessTask) => {
    setDeleteConfirm({ isOpen: true, task })
  }

  const confirmDelete = async () => {
    const task = deleteConfirm.task
    setDeleteConfirm({ isOpen: false, task: null })
    if (task?.id) {
      await db.businessTasks.update(task.id, { archived: true, updatedAt: new Date().toISOString() })
      await loadTasks()
    }
  }

  const handleToggleComplete = async (task: BusinessTask) => {
    if (task.recurrence !== 'once' || !task.id) return
    await db.businessTasks.update(task.id, { completed: !task.completed, updatedAt: new Date().toISOString() })
    await loadTasks()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editing) return
    e.target.value = ''

    if (!driveConnected) return
    setUploading(true)
    try {
      const result = await uploadTaxDocument(file, new Date().getFullYear())
      setEditing({
        ...editing,
        attachmentDriveFileId: result.fileId,
        attachmentDriveWebViewLink: result.webViewLink,
        attachmentFileName: file.name,
      })
    } catch (err: any) {
      console.error('[BusinessTasks] Upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveAttachment = () => {
    if (!editing) return
    setEditing({
      ...editing,
      attachmentDriveFileId: undefined,
      attachmentDriveWebViewLink: undefined,
      attachmentFileName: undefined,
    })
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#94a3b8' }}>טוען...</p>

  return (
    <div>
      {/* Add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
          {tasks.length > 0 ? `${tasks.length} משימות פעילות` : ''}
        </span>
        <button
          onClick={handleAdd}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          + משימה חדשה
        </button>
      </div>

      {/* Task list */}
      {tasks.length === 0 && !editing ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
          אין משימות. הוסף משימה חוזרת כמו תשלום חודשי.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tasks.map(task => {
            const nextDue = formatNextDue(task)
            const prio = PRIORITY_CONFIG[task.priority]
            return (
              <div
                key={task.id}
                style={{
                  padding: '0.75rem 1rem',
                  background: task.completed ? '#f8fafc' : '#fff',
                  border: '1px solid #e2e8f0',
                  borderRight: `4px solid ${prio.color}`,
                  borderRadius: '0.5rem',
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'center',
                  opacity: task.completed ? 0.6 : 1,
                }}
              >
                {/* Complete checkbox for one-time tasks */}
                {task.recurrence === 'once' && (
                  <input
                    type="checkbox"
                    checked={!!task.completed}
                    onChange={() => handleToggleComplete(task)}
                    style={{ width: '1rem', height: '1rem', cursor: 'pointer', flexShrink: 0 }}
                  />
                )}

                {/* Task info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', textDecoration: task.completed ? 'line-through' : 'none' }}>
                    {task.title}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: '#64748b', marginTop: '0.125rem', flexWrap: 'wrap' }}>
                    <span>{formatDueDescription(task)}</span>
                    {task.reminderDaysBefore != null && task.reminderDaysBefore > 0 && (
                      <span>תזכורת: {task.reminderDaysBefore} ימים לפני</span>
                    )}
                  </div>
                  {task.description && (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>{task.description}</div>
                  )}
                </div>

                {/* Next due */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.75rem', color: nextDue.color, fontWeight: 600 }}>{nextDue.text}</div>
                </div>

                {/* Priority badge */}
                <span style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '0.25rem',
                  background: prio.bg,
                  color: prio.color,
                  fontWeight: 600,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}>
                  {prio.label}
                </span>

                {/* Attachment indicator */}
                {task.attachmentDriveWebViewLink && (
                  <a
                    href={task.attachmentDriveWebViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={task.attachmentFileName || 'קובץ מצורף'}
                    style={{ fontSize: '1rem', textDecoration: 'none', flexShrink: 0 }}
                  >
                    📎
                  </a>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  <button
                    onClick={() => handleEdit(task)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      color: '#475569',
                    }}
                  >
                    ערוך
                  </button>
                  <button
                    onClick={() => handleDelete(task)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      color: '#dc2626',
                    }}
                  >
                    מחק
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit / Add form (inline) */}
      {editing && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.5rem',
        }}>
          <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>
            {isNew ? 'משימה חדשה' : 'עריכת משימה'}
          </h4>

          {/* Title */}
          <div style={{ marginBottom: '0.5rem' }}>
            <input
              value={editing.title}
              onChange={e => setEditing({ ...editing, title: e.target.value })}
              placeholder="תיאור המשימה (לדוגמה: תשלום בל״ל חודשי)"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '0.5rem' }}>
            <textarea
              value={editing.description || ''}
              onChange={e => setEditing({ ...editing, description: e.target.value })}
              placeholder="הערות נוספות (אופציונלי)"
              rows={2}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                fontSize: '0.85rem',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Recurrence + Due day */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b' }}>תדירות</label>
              <select
                value={editing.recurrence}
                onChange={e => setEditing({ ...editing, recurrence: e.target.value as RecurrenceType })}
                style={{
                  display: 'block',
                  padding: '0.4rem 0.5rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.25rem',
                  fontSize: '0.85rem',
                }}
              >
                {Object.entries(RECURRENCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {editing.recurrence === 'monthly' && (
              <div>
                <label style={{ fontSize: '0.75rem', color: '#64748b' }}>עד יום בחודש</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={editing.dueDay || 15}
                  onChange={e => setEditing({ ...editing, dueDay: Number(e.target.value) })}
                  style={{
                    display: 'block',
                    width: '80px',
                    padding: '0.4rem 0.5rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.25rem',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            )}

            {editing.recurrence === 'weekly' && (
              <div>
                <label style={{ fontSize: '0.75rem', color: '#64748b' }}>יום בשבוע</label>
                <select
                  value={editing.dueDay ?? 0}
                  onChange={e => setEditing({ ...editing, dueDay: Number(e.target.value) })}
                  style={{
                    display: 'block',
                    padding: '0.4rem 0.5rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.25rem',
                    fontSize: '0.85rem',
                  }}
                >
                  {DAY_OF_WEEK.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {(editing.recurrence === 'yearly' || editing.recurrence === 'once') && (
              <>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#64748b' }}>יום</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={editing.dueDay || 1}
                    onChange={e => setEditing({ ...editing, dueDay: Number(e.target.value) })}
                    style={{
                      display: 'block',
                      width: '80px',
                      padding: '0.4rem 0.5rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '0.25rem',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#64748b' }}>חודש</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={editing.dueMonth || 1}
                    onChange={e => setEditing({ ...editing, dueMonth: Number(e.target.value) })}
                    style={{
                      display: 'block',
                      width: '80px',
                      padding: '0.4rem 0.5rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '0.25rem',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </>
            )}

            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b' }}>תזכורת (ימים לפני)</label>
              <input
                type="number"
                min={0}
                max={30}
                value={editing.reminderDaysBefore ?? 3}
                onChange={e => setEditing({ ...editing, reminderDaysBefore: Number(e.target.value) })}
                style={{
                  display: 'block',
                  width: '80px',
                  padding: '0.4rem 0.5rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.25rem',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b' }}>עדיפות</label>
              <select
                value={editing.priority}
                onChange={e => setEditing({ ...editing, priority: e.target.value as 'low' | 'medium' | 'high' })}
                style={{
                  display: 'block',
                  padding: '0.4rem 0.5rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.25rem',
                  fontSize: '0.85rem',
                }}
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Attachment */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>קובץ מצורף (אופציונלי)</label>
            {editing.attachmentFileName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <span>📎</span>
                {editing.attachmentDriveWebViewLink ? (
                  <a href={editing.attachmentDriveWebViewLink} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
                    {editing.attachmentFileName}
                  </a>
                ) : (
                  <span>{editing.attachmentFileName}</span>
                )}
                <button
                  onClick={handleRemoveAttachment}
                  style={{ fontSize: '0.75rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  הסר
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !driveConnected}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    background: uploading ? '#94a3b8' : '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.25rem',
                    cursor: uploading || !driveConnected ? 'not-allowed' : 'pointer',
                    color: '#475569',
                  }}
                >
                  {uploading ? 'מעלה...' : '📎 העלה קובץ'}
                </button>
                {!driveConnected && (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: '0.5rem' }}>
                    (חבר Google Drive בהגדרות)
                  </span>
                )}
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </div>

          {/* Save / Cancel */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setEditing(null)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                color: '#475569',
              }}
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={!editing.title.trim()}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                background: editing.title.trim() ? '#3b82f6' : '#94a3b8',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: editing.title.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {isNew ? 'הוסף' : 'שמור'}
            </button>
          </div>
        </div>
      )}

      <YesNoModal
        isOpen={deleteConfirm.isOpen}
        question={`למחוק את "${deleteConfirm.task?.title ?? ''}"?`}
        onYes={confirmDelete}
        onNo={() => setDeleteConfirm({ isOpen: false, task: null })}
      />
    </div>
  )
}
