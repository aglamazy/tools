'use client'

import type { AutoTask } from '@/app/stores/todoStore'
import type { AgentTaskStatus } from '@/app/types/bot'
import AgentStatusBadge from './AgentStatusBadge'

type Priority = 'low' | 'medium' | 'high'

type QuadrantConfig = {
  key: string
  borderColor: string
}

export type CombinedTask = {
  id: string | number
  title: string
  completed: boolean
  priority: Priority
  quadrant: string
  deadline?: string
  snoozedUntil?: string
  delegatedTo?: string
  delegatedBy?: string
  botId?: string
  agentTaskId?: string
  agentStatus?: AgentTaskStatus
  agentResult?: string
  createdAt: string
  taskType: 'user' | 'auto'
  autoType?: AutoTask['type']
  link?: string
  month?: string
}

type Props = {
  task: CombinedTask
  quadrant: QuadrantConfig
  currentUid: string | null
  partnerEmail: string | null
  draggedTaskId: string | number | null
  isDropTarget: boolean
  isSnoozed: boolean
  snoozeMenuOpen: boolean
  snoozeMenuRef: React.RefObject<HTMLDivElement | null>
  partnerUid: string | null
  onToggle: (id: number) => void
  onDelete: (id: number) => void
  onMarkAutoTaskDone: (task: CombinedTask) => void
  onDragStart: (task: CombinedTask) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent, taskId: string | number) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, task: CombinedTask) => void
  onSnoozeMenuToggle: (taskId: string | number | null) => void
  onSnooze: (task: CombinedTask, days: number) => void
  onUnsnooze: (task: CombinedTask) => void
  onDelegate: (task: CombinedTask) => void
  onUndelegate: (taskId: number) => void
}

const getAutoTaskIcon = (type: AutoTask['type']): string => {
  switch (type) {
    case 'missing-file': return '📄'
    case 'uncategorized': return '🏷️'
    case 'expected-payment': return '💳'
    case 'recurring': return '🔁'
    case 'other': return '⚠️'
  }
}

const getPriorityIndicator = (priority: Priority): { color: string; label: string } => {
  switch (priority) {
    case 'high': return { color: '#dc2626', label: 'גבוהה' }
    case 'medium': return { color: '#f59e0b', label: 'בינונית' }
    case 'low': return { color: '#6b7280', label: 'נמוכה' }
  }
}

const formatDeadline = (dateString?: string): string => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `באיחור ${Math.abs(diffDays)} ימים`
  if (diffDays === 0) return 'היום'
  if (diffDays === 1) return 'מחר'
  if (diffDays < 7) return `בעוד ${diffDays} ימים`
  return date.toLocaleDateString('he-IL')
}

const getDeadlineColor = (dateString?: string): string => {
  if (!dateString) return '#6b7280'
  const date = new Date(dateString)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return '#dc2626'
  if (diffDays <= 3) return '#f97316'
  return '#6b7280'
}

export default function TaskCard({
  task,
  quadrant,
  currentUid,
  partnerEmail,
  draggedTaskId,
  isDropTarget,
  isSnoozed,
  snoozeMenuOpen,
  snoozeMenuRef,
  partnerUid,
  onToggle,
  onDelete,
  onMarkAutoTaskDone,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onSnoozeMenuToggle,
  onSnooze,
  onUnsnooze,
  onDelegate,
  onUndelegate,
}: Props) {
  const priorityInfo = getPriorityIndicator(task.priority)

  return (
    <div
      draggable={task.taskType === 'user'}
      onDragStart={() => onDragStart(task)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, task.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, task)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        background: isDropTarget ? '#e0f2fe' : task.completed ? '#f8fafc' : '#fff',
        borderRadius: '0.375rem',
        border: `1px solid ${isDropTarget ? '#38bdf8' : task.completed ? '#e2e8f0' : quadrant.borderColor}`,
        opacity: task.completed ? 0.6 : draggedTaskId === task.id ? 0.4 : 1,
        cursor: task.taskType === 'user' ? 'grab' : 'default',
        transition: 'opacity 0.15s, box-shadow 0.15s, background 0.15s, border-color 0.15s',
        fontSize: '0.875rem',
        boxShadow: isDropTarget ? '0 0 0 2px #38bdf8' : 'none',
      }}
    >
      {/* Checkbox */}
      {task.taskType === 'user' ? (
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task.id as number)}
          style={{ width: '1rem', height: '1rem', cursor: 'pointer', flexShrink: 0 }}
        />
      ) : task.autoType === 'recurring' ? (
        <input
          type="checkbox"
          checked={false}
          onChange={() => onMarkAutoTaskDone(task)}
          title="סמן כבוצע"
          style={{ width: '1rem', height: '1rem', cursor: 'pointer', flexShrink: 0 }}
        />
      ) : (
        <span style={{ width: '1rem', flexShrink: 0 }} />
      )}

      {/* Priority indicator */}
      <span
        title={`עדיפות: ${priorityInfo.label}`}
        style={{
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: '50%',
          background: priorityInfo.color,
          flexShrink: 0,
        }}
      />

      {/* Task content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          textDecoration: task.completed ? 'line-through' : 'none',
          color: task.completed ? '#9ca3af' : '#1f2937',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {task.taskType === 'auto' && <span style={{ marginLeft: '0.25rem' }}>{getAutoTaskIcon(task.autoType!)}</span>}
          {task.taskType === 'auto' && task.link ? (
            <a href={task.link} style={{ color: '#3b82f6', textDecoration: 'underline' }}>{task.title}</a>
          ) : task.title}
        </div>

        {/* Deadline + delegation + agent status info */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.125rem', flexWrap: 'wrap' }}>
          {task.deadline && (
            <span style={{ fontSize: '0.7rem', color: getDeadlineColor(task.deadline) }}>
              {formatDeadline(task.deadline)}
            </span>
          )}
          {isSnoozed && (
            <span style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 500 }}>
              😴 מוסתר
            </span>
          )}
          {task.delegatedTo && !task.botId && (
            <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 500 }}>
              👥 {task.delegatedTo === currentUid ? 'הואצל אליי' : `הואצל ל${partnerEmail || 'שותף/ה'}`}
            </span>
          )}
          {task.botId && task.agentStatus && (
            <AgentStatusBadge status={task.agentStatus} result={task.agentResult} />
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, position: 'relative' }}>
        {/* Snooze button */}
        {!task.completed && (
          isSnoozed ? (
            <button
              onClick={() => onUnsnooze(task)}
              title="בטל הסתרה"
              style={{
                padding: '0.15rem 0.35rem',
                fontSize: '0.75rem',
                border: '1px solid #c4b5fd',
                borderRadius: '0.25rem',
                background: '#ede9fe',
                cursor: 'pointer',
                color: '#7c3aed',
                lineHeight: 1,
              }}
            >
              ☀️
            </button>
          ) : (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => onSnoozeMenuToggle(snoozeMenuOpen ? null : task.id)}
                title="הסתר משימה"
                style={{
                  padding: '0.15rem 0.35rem',
                  fontSize: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.25rem',
                  background: '#f9fafb',
                  cursor: 'pointer',
                  color: '#6b7280',
                  lineHeight: 1,
                }}
              >
                😴
              </button>
              {snoozeMenuOpen && (
                <div
                  ref={snoozeMenuRef}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '0.25rem',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    zIndex: 50,
                    minWidth: '140px',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '0.375rem 0.75rem', fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, borderBottom: '1px solid #f3f4f6' }}>
                    😴 הסתר ל...
                  </div>
                  {[
                    { days: 1, label: '☀️ מחר' },
                    { days: 3, label: '📅 3 ימים' },
                    { days: 7, label: '🗓️ שבוע' },
                  ].map(opt => (
                    <button
                      key={opt.days}
                      onClick={() => onSnooze(task, opt.days)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.85rem',
                        background: 'none',
                        border: 'none',
                        borderBottom: '1px solid #f9fafb',
                        cursor: 'pointer',
                        textAlign: 'right',
                        color: '#374151',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {/* Delegate button - for user tasks when targets exist */}
        {task.taskType === 'user' && !task.completed && !task.delegatedTo && !task.botId && (partnerUid || true) && (
          <button
            onClick={() => onDelegate(task)}
            title="האצל"
            style={{
              padding: '0.15rem 0.35rem',
              fontSize: '0.75rem',
              border: '1px solid #bfdbfe',
              borderRadius: '0.25rem',
              background: '#eff6ff',
              cursor: 'pointer',
              color: '#2563eb',
              lineHeight: 1,
            }}
          >
            👥
          </button>
        )}

        {/* Undelegate button */}
        {task.taskType === 'user' && !task.completed && (task.delegatedTo || task.botId) && (
          <button
            onClick={() => onUndelegate(task.id as number)}
            title="בטל האצלה"
            style={{
              padding: '0.15rem 0.35rem',
              fontSize: '0.75rem',
              border: '1px solid #fde68a',
              borderRadius: '0.25rem',
              background: '#fffbeb',
              cursor: 'pointer',
              color: '#d97706',
              lineHeight: 1,
            }}
          >
            ↩️
          </button>
        )}

        {/* Delete button */}
        {task.taskType === 'user' && (
          <button
            onClick={() => onDelete(task.id as number)}
            style={{
              padding: '0.15rem 0.35rem',
              fontSize: '0.75rem',
              border: '1px solid #fecaca',
              borderRadius: '0.25rem',
              background: 'white',
              cursor: 'pointer',
              color: '#dc2626',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
