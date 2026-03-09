'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import { todoStore, type UserTask, type AutoTask, type EisenhowerQuadrant } from '@/app/stores/todoStore'
import { getUser } from '@/app/stores/authStore'
import { getHouseholdInfo } from '@/app/services/householdService'

type Priority = 'low' | 'medium' | 'high'

type QuadrantConfig = {
  key: EisenhowerQuadrant
  title: string
  subtitle: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
}

const QUADRANTS: QuadrantConfig[] = [
  { key: 'do', title: 'עשה עכשיו', subtitle: 'דחוף וחשוב', color: '#dc2626', bgColor: '#fef2f2', borderColor: '#fecaca', icon: '🔥' },
  { key: 'schedule', title: 'תזמן', subtitle: 'חשוב, לא דחוף', color: '#2563eb', bgColor: '#eff6ff', borderColor: '#bfdbfe', icon: '📅' },
  { key: 'delegate', title: 'האצל', subtitle: 'דחוף, לא חשוב', color: '#d97706', bgColor: '#fffbeb', borderColor: '#fde68a', icon: '👥' },
  { key: 'eliminate', title: 'הסר', subtitle: 'לא דחוף, לא חשוב', color: '#6b7280', bgColor: '#f9fafb', borderColor: '#e5e7eb', icon: '🗑️' },
]

type CombinedTask = {
  id: string | number
  title: string
  completed: boolean
  priority: Priority
  quadrant: EisenhowerQuadrant
  deadline?: string
  delegatedTo?: string
  delegatedBy?: string
  createdAt: string
  taskType: 'user' | 'auto'
  autoType?: AutoTask['type']
  link?: string
  month?: string
}

export default function TodoPage() {
  const { showToast } = useToast()
  const [userTasks, setUserTasks] = useState<UserTask[]>([])
  const [autoTasks, setAutoTasks] = useState<AutoTask[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium')
  const [newTaskQuadrant, setNewTaskQuadrant] = useState<EisenhowerQuadrant>('do')
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)
  const [draggedTask, setDraggedTask] = useState<CombinedTask | null>(null)
  const [dragOverQuadrant, setDragOverQuadrant] = useState<EisenhowerQuadrant | null>(null)

  // Household / partner delegation state
  const [partnerUid, setPartnerUid] = useState<string | null>(null)
  const [partnerEmail, setPartnerEmail] = useState<string | null>(null)
  const [currentUid, setCurrentUid] = useState<string | null>(null)

  // Load tasks and household info on mount
  useEffect(() => {
    loadTasks()
    loadHouseholdPartner()
  }, [])

  const loadTasks = async () => {
    setLoading(true)
    const tasks = await todoStore.getAllTasks()
    setUserTasks(tasks)
    const autoTasksData = await todoStore.getAutoTasks()
    setAutoTasks(autoTasksData)
    setLoading(false)
  }

  const loadHouseholdPartner = async () => {
    const user = getUser()
    if (!user) return
    setCurrentUid(user.uid)

    try {
      const info = await getHouseholdInfo()
      if (info.success && info.household && info.household.members.length === 2) {
        const partner = info.household.members.find(m => m !== user.uid)
        if (partner) {
          setPartnerUid(partner)
          const householdWithEmails = info.household as any
          setPartnerEmail(householdWithEmails.memberEmails?.[partner] || 'שותף/ה')
        }
      }
    } catch {
      // No household or error - delegation not available
    }
  }

  const handleAddUserTask = async () => {
    if (!newTaskTitle.trim()) return
    const newTask = await todoStore.addTask(newTaskTitle, newTaskPriority, newTaskQuadrant)
    setUserTasks([newTask, ...userTasks])
    setNewTaskTitle('')
    setNewTaskPriority('medium')
    showToast('success', 'משימה נוספה', '✅')
  }

  const toggleUserTask = async (id: number) => {
    await todoStore.toggleTask(id)
    setUserTasks(userTasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
  }

  const deleteUserTask = async (id: number) => {
    await todoStore.deleteTask(id)
    setUserTasks(userTasks.filter(t => t.id !== id))
    showToast('success', 'משימה נמחקה', '🗑️')
  }

  const moveTaskToQuadrant = async (task: CombinedTask, newQuadrant: EisenhowerQuadrant) => {
    if (task.taskType === 'user') {
      await todoStore.moveTask(task.id as number, newQuadrant)
      setUserTasks(userTasks.map(t => t.id === task.id ? { ...t, quadrant: newQuadrant } : t))
    }
    // Auto tasks can't be permanently moved (they're computed)
  }

  const delegateTask = async (taskId: number) => {
    if (!partnerUid) return
    await todoStore.delegateTask(taskId, partnerUid)
    setUserTasks(userTasks.map(t =>
      t.id === taskId ? { ...t, delegatedTo: partnerUid, delegatedBy: currentUid || undefined, quadrant: 'delegate' } : t
    ))
    showToast('success', `משימה הואצלה ל${partnerEmail}`, '👥')
  }

  const undelegateTask = async (taskId: number) => {
    await todoStore.undelegateTask(taskId)
    setUserTasks(userTasks.map(t =>
      t.id === taskId ? { ...t, delegatedTo: undefined, delegatedBy: undefined, quadrant: 'do' } : t
    ))
    showToast('success', 'האצלה בוטלה', '↩️')
  }

  // Drag and drop handlers
  const handleDragStart = (task: CombinedTask) => {
    if (task.taskType === 'auto') return // Can't drag auto tasks
    setDraggedTask(task)
  }

  const handleDragOver = (e: React.DragEvent, quadrant: EisenhowerQuadrant) => {
    e.preventDefault()
    setDragOverQuadrant(quadrant)
  }

  const handleDragLeave = () => {
    setDragOverQuadrant(null)
  }

  const handleDrop = async (e: React.DragEvent, quadrant: EisenhowerQuadrant) => {
    e.preventDefault()
    setDragOverQuadrant(null)
    if (draggedTask && draggedTask.quadrant !== quadrant) {
      await moveTaskToQuadrant(draggedTask, quadrant)
    }
    setDraggedTask(null)
  }

  const handleDragEnd = () => {
    setDraggedTask(null)
    setDragOverQuadrant(null)
  }

  // Combine and group tasks by quadrant
  const getAllCombinedTasks = (): CombinedTask[] => {
    const combined: CombinedTask[] = [
      ...userTasks.map(t => ({ ...t, id: t.id, taskType: 'user' as const })),
      ...autoTasks.map(t => ({
        id: t.id,
        title: t.title,
        completed: false,
        priority: t.priority,
        quadrant: t.quadrant,
        deadline: t.deadline,
        createdAt: t.createdAt,
        taskType: 'auto' as const,
        autoType: t.type,
        link: t.link,
        month: t.month,
      })),
    ]
    if (!showCompleted) {
      return combined.filter(t => t.taskType === 'auto' || !t.completed)
    }
    return combined
  }

  const getTasksForQuadrant = (quadrant: EisenhowerQuadrant): CombinedTask[] => {
    return getAllCombinedTasks()
      .filter(t => t.quadrant === quadrant)
      .sort((a, b) => {
        // Sort by priority (high first), then by deadline
        const pv = (p: Priority) => p === 'high' ? 3 : p === 'medium' ? 2 : 1
        const pd = pv(b.priority) - pv(a.priority)
        if (pd !== 0) return pd
        if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        return 0
      })
  }

  const getAutoTaskIcon = (type: AutoTask['type']): string => {
    switch (type) {
      case 'missing-file': return '📄'
      case 'uncategorized': return '🏷️'
      case 'expected-payment': return '💳'
      case 'other': return '⚠️'
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

  const activeTaskCount = userTasks.filter(t => !t.completed).length + autoTasks.length

  const renderTask = (task: CombinedTask, quadrant: QuadrantConfig) => (
    <div
      key={task.id}
      draggable={task.taskType === 'user'}
      onDragStart={() => handleDragStart(task)}
      onDragEnd={handleDragEnd}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        background: task.completed ? '#f8fafc' : '#fff',
        borderRadius: '0.375rem',
        border: `1px solid ${task.completed ? '#e2e8f0' : quadrant.borderColor}`,
        opacity: task.completed ? 0.6 : draggedTask?.id === task.id ? 0.4 : 1,
        cursor: task.taskType === 'user' ? 'grab' : 'default',
        transition: 'opacity 0.15s, box-shadow 0.15s',
        fontSize: '0.875rem',
      }}
    >
      {/* Checkbox / Icon */}
      {task.taskType === 'user' ? (
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => toggleUserTask(task.id as number)}
          style={{ width: '1rem', height: '1rem', cursor: 'pointer', flexShrink: 0 }}
        />
      ) : (
        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{getAutoTaskIcon(task.autoType!)}</span>
      )}

      {/* Task content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          textDecoration: task.completed ? 'line-through' : 'none',
          color: task.completed ? '#9ca3af' : '#1f2937',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {task.taskType === 'auto' && task.link ? (
            <a href={task.link} style={{ color: '#3b82f6', textDecoration: 'underline' }}>{task.title}</a>
          ) : task.title}
        </div>

        {/* Deadline + delegation info */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.125rem' }}>
          {task.deadline && (
            <span style={{ fontSize: '0.7rem', color: getDeadlineColor(task.deadline) }}>
              {formatDeadline(task.deadline)}
            </span>
          )}
          {task.delegatedTo && (
            <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 500 }}>
              👥 {task.delegatedTo === currentUid ? 'הואצל אליי' : `הואצל ל${partnerEmail || 'שותף/ה'}`}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
        {/* Delegate button - only for user tasks when partner exists */}
        {task.taskType === 'user' && partnerUid && !task.completed && (
          task.delegatedTo ? (
            <button
              onClick={() => undelegateTask(task.id as number)}
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
          ) : (
            <button
              onClick={() => delegateTask(task.id as number)}
              title={`האצל ל${partnerEmail || 'שותף/ה'}`}
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
          )
        )}

        {/* Delete button */}
        {task.taskType === 'user' && (
          <button
            onClick={() => deleteUserTask(task.id as number)}
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

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>מטריצת אייזנהאואר</h1>
          <p>ניהול משימות לפי דחיפות וחשיבות ({activeTaskCount} פעילות)</p>
        </header>

        {/* Add new user task */}
        <section style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddUserTask()}
              placeholder="הוסף משימה חדשה..."
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem',
              }}
            />
            <select
              value={newTaskQuadrant}
              onChange={(e) => setNewTaskQuadrant(e.target.value as EisenhowerQuadrant)}
              style={{
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white',
              }}
            >
              {QUADRANTS.map(q => (
                <option key={q.key} value={q.key}>{q.icon} {q.title}</option>
              ))}
            </select>
            <button onClick={handleAddUserTask} className="file-picker" style={{ margin: 0 }}>
              הוסף
            </button>
          </div>
        </section>

        {/* Controls */}
        <section style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#6b7280', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              style={{ width: '1rem', height: '1rem' }}
            />
            הצג הושלמו
          </label>
          {partnerUid && (
            <span style={{ fontSize: '0.8rem', color: '#059669', background: '#ecfdf5', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
              👥 שותף/ה: {partnerEmail}
            </span>
          )}
        </section>

        {/* Eisenhower Matrix Grid */}
        <section style={{ marginTop: '1.5rem' }}>
          {/* Axis labels */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#374151',
            }}>
              <span>← חשוב</span>
              <span style={{ width: '2rem' }}></span>
              <span>לא חשוב →</span>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: 'auto auto',
            gap: '0.75rem',
          }}>
            {QUADRANTS.map(q => {
              const tasks = getTasksForQuadrant(q.key)
              const isDragOver = dragOverQuadrant === q.key

              return (
                <div
                  key={q.key}
                  onDragOver={(e) => handleDragOver(e, q.key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, q.key)}
                  style={{
                    border: `2px solid ${isDragOver ? q.color : q.borderColor}`,
                    borderRadius: '0.75rem',
                    background: isDragOver ? `${q.bgColor}` : '#fff',
                    minHeight: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.2s, background 0.2s',
                    boxShadow: isDragOver ? `0 0 0 3px ${q.borderColor}` : 'none',
                  }}
                >
                  {/* Quadrant header */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: q.bgColor,
                    borderTopLeftRadius: '0.625rem',
                    borderTopRightRadius: '0.625rem',
                    borderBottom: `1px solid ${q.borderColor}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <span style={{ fontSize: '1rem', marginLeft: '0.375rem' }}>{q.icon}</span>
                      <span style={{ fontWeight: 600, color: q.color, fontSize: '0.95rem' }}>{q.title}</span>
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem', marginRight: '0.5rem' }}>{q.subtitle}</span>
                    </div>
                    <span style={{
                      fontSize: '0.75rem',
                      background: tasks.length > 0 ? q.color : '#d1d5db',
                      color: '#fff',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '1rem',
                      fontWeight: 600,
                    }}>
                      {tasks.length}
                    </span>
                  </div>

                  {/* Tasks list */}
                  <div style={{
                    padding: '0.5rem',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem',
                    overflowY: 'auto',
                    maxHeight: '350px',
                  }}>
                    {tasks.length === 0 ? (
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#d1d5db',
                        fontSize: '0.85rem',
                        fontStyle: 'italic',
                      }}>
                        {draggedTask ? 'שחרר כאן' : 'אין משימות'}
                      </div>
                    ) : (
                      tasks.map(task => renderTask(task, q))
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Axis label - bottom */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#374151',
            }}>
              <span>↑ דחוף &nbsp;&nbsp;&nbsp;&nbsp; לא דחוף ↓</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
