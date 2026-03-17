'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import { todoStore, type UserTask, type AutoTask, type EisenhowerQuadrant } from '@/app/stores/todoStore'
import { getUser } from '@/app/stores/authStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import { listBots, createAgentTask, subscribeToAgentTasks, type BotSummary } from '@/app/services/botService'
import TaskCard, { type CombinedTask } from '@/app/components/todo/TaskCard'
import DelegatePickerModal, { type DelegateTarget } from '@/app/components/todo/DelegatePickerModal'

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
  const [dragOverTaskId, setDragOverTaskId] = useState<string | number | null>(null)
  const [snoozeMenuTaskId, setSnoozeMenuTaskId] = useState<string | number | null>(null)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const snoozeMenuRef = useRef<HTMLDivElement>(null)

  // Household / partner delegation state
  const [partnerUid, setPartnerUid] = useState<string | null>(null)
  const [partnerEmail, setPartnerEmail] = useState<string | null>(null)
  const [currentUid, setCurrentUid] = useState<string | null>(null)

  // Bot delegation state
  const [bots, setBots] = useState<BotSummary[]>([])
  const [delegatePickerTask, setDelegatePickerTask] = useState<CombinedTask | null>(null)

  // Close snooze menu on outside click
  useEffect(() => {
    if (!snoozeMenuTaskId) return
    const handler = (e: MouseEvent) => {
      if (snoozeMenuRef.current && !snoozeMenuRef.current.contains(e.target as Node)) {
        setSnoozeMenuTaskId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [snoozeMenuTaskId])

  // Load tasks, household info, and bots on mount
  useEffect(() => {
    loadTasks()
    loadHouseholdPartner()
    loadBots()
  }, [])

  // Subscribe to agent task status updates
  useEffect(() => {
    const unsubscribe = subscribeToAgentTasks((agentTasks) => {
      setUserTasks(prev => prev.map(task => {
        if (!task.agentTaskId) return task
        const at = agentTasks.find(a => a.id === task.agentTaskId)
        if (!at) return task
        if (at.status !== task.agentStatus || at.result !== task.agentResult) {
          todoStore.updateAgentStatus(task.id, at.status, at.result || undefined)
          return { ...task, agentStatus: at.status, agentResult: at.result || undefined }
        }
        return task
      }))
    })
    return () => { unsubscribe?.() }
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
      // No household or error
    }
  }

  const loadBots = async () => {
    try {
      const data = await listBots()
      setBots(data)
    } catch {
      // Not authenticated or no bots
    }
  }

  /** Detect @BotName or @PartnerName mention in task title and auto-delegate */
  const detectMentionAndDelegate = async (task: UserTask, title: string) => {
    const mentionMatch = title.match(/@(\S+)/)
    if (!mentionMatch) return

    const mention = mentionMatch[1]

    // Check bots
    const bot = bots.find(b =>
      b.name.toLowerCase() === mention.toLowerCase() ||
      b.handle.toLowerCase() === mention.toLowerCase()
    )
    if (bot) {
      try {
        const agentTaskId = await createAgentTask({
          botId: bot.id,
          botHandle: bot.handle,
          localTaskId: task.id,
          title: title.replace(/@\S+\s*/, '').trim(),
          description: '',
          priority: task.priority,
        })
        await todoStore.delegateToBot(task.id, bot.id, agentTaskId)
        setUserTasks(prev => prev.map(t =>
          t.id === task.id
            ? { ...t, botId: bot.id, agentTaskId, agentStatus: 'pending', quadrant: 'delegate' }
            : t
        ))
        showToast('success', `משימה הואצלה ל${bot.name}`, '🤖')
      } catch (e: any) {
        console.log('[Todo] Auto-delegate to bot failed:', e.message)
      }
      return
    }

    // Check partner
    if (partnerEmail && mention.toLowerCase() === partnerEmail.toLowerCase() && partnerUid) {
      await delegateToPartner(task.id)
    }
  }

  const handleAddUserTask = async () => {
    if (!newTaskTitle.trim()) return
    const newTask = await todoStore.addTask(newTaskTitle, newTaskPriority, newTaskQuadrant)
    setUserTasks([newTask, ...userTasks])
    setNewTaskTitle('')
    setNewTaskPriority('medium')
    showToast('success', 'משימה נוספה', '✅')

    // Check for @mention auto-delegation
    if (newTaskTitle.includes('@')) {
      await detectMentionAndDelegate(newTask, newTaskTitle)
    }
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
      // If dragging to delegate quadrant, show picker
      if (newQuadrant === 'delegate' && !task.delegatedTo && !task.botId) {
        setDelegatePickerTask(task)
        return
      }
      await todoStore.moveTask(task.id as number, newQuadrant)
      setUserTasks(userTasks.map(t => t.id === task.id ? { ...t, quadrant: newQuadrant } : t))
    }
  }

  const changeTaskPriority = async (task: CombinedTask, newPriority: Priority) => {
    if (task.taskType === 'user' && task.priority !== newPriority) {
      await todoStore.updateTaskPriority(task.id as number, newPriority)
      setUserTasks(userTasks.map(t => t.id === task.id ? { ...t, priority: newPriority } : t))
      const labels: Record<Priority, string> = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' }
      showToast('success', `עדיפות שונתה ל${labels[newPriority]}`, '↕️')
    }
  }

  const delegateToPartner = async (taskId: number) => {
    if (!partnerUid) return
    await todoStore.delegateTask(taskId, partnerUid)
    setUserTasks(userTasks.map(t =>
      t.id === taskId ? { ...t, delegatedTo: partnerUid, delegatedBy: currentUid || undefined, quadrant: 'delegate' } : t
    ))
    showToast('success', `משימה הואצלה ל${partnerEmail}`, '👥')
  }

  const delegateToBot = async (taskId: number, bot: BotSummary) => {
    const task = userTasks.find(t => t.id === taskId)
    if (!task) return
    try {
      const agentTaskId = await createAgentTask({
        botId: bot.id,
        botHandle: bot.handle,
        localTaskId: taskId,
        title: task.title,
        description: '',
        priority: task.priority,
      })
      await todoStore.delegateToBot(taskId, bot.id, agentTaskId)
      setUserTasks(userTasks.map(t =>
        t.id === taskId
          ? { ...t, botId: bot.id, agentTaskId, agentStatus: 'pending', quadrant: 'delegate' }
          : t
      ))
      showToast('success', `משימה הואצלה ל${bot.name}`, '🤖')
    } catch (e: any) {
      showToast('error', 'שגיאה בהאצלה לבוט')
      console.log('[Todo] delegateToBot failed:', e.message)
    }
  }

  const handleDelegateSelect = async (target: DelegateTarget) => {
    if (!delegatePickerTask) return
    const taskId = delegatePickerTask.id as number
    setDelegatePickerTask(null)

    if (target.type === 'partner') {
      await delegateToPartner(taskId)
    } else {
      await delegateToBot(taskId, target.bot)
    }
  }

  const undelegateTask = async (taskId: number) => {
    await todoStore.undelegateTask(taskId)
    setUserTasks(userTasks.map(t =>
      t.id === taskId
        ? { ...t, delegatedTo: undefined, delegatedBy: undefined, botId: undefined, agentTaskId: undefined, agentStatus: undefined, agentResult: undefined, quadrant: 'do' }
        : t
    ))
    showToast('success', 'האצלה בוטלה', '↩️')
  }

  const snoozeTask = async (task: CombinedTask, days: number) => {
    const until = new Date()
    until.setDate(until.getDate() + days)
    until.setHours(0, 0, 0, 0)
    const untilISO = until.toISOString()
    if (task.taskType === 'user') {
      await todoStore.snoozeTask(task.id as number, untilISO)
      setUserTasks(userTasks.map(t => t.id === task.id ? { ...t, snoozedUntil: untilISO } : t))
    } else {
      await todoStore.snoozeAutoTask(task.id as string, untilISO)
      setAutoTasks(autoTasks.filter(t => t.id !== task.id))
    }
    setSnoozeMenuTaskId(null)
    const labels: Record<number, string> = { 1: 'מחר', 3: '3 ימים', 7: 'שבוע' }
    showToast('success', `משימה מוסתרת עד ${labels[days] || `${days} ימים`}`, '😴')
  }

  const unsnoozeTask = async (task: CombinedTask) => {
    if (task.taskType === 'user') {
      await todoStore.unsnoozeTask(task.id as number)
      setUserTasks(userTasks.map(t => t.id === task.id ? { ...t, snoozedUntil: undefined } : t))
    } else {
      await todoStore.unsnoozeAutoTask(task.id as string)
      const autoTasksData = await todoStore.getAutoTasks()
      setAutoTasks(autoTasksData)
    }
    showToast('success', 'משימה חזרה לפעילה', '☀️')
  }

  const markAutoTaskDone = async (task: CombinedTask) => {
    if (task.taskType !== 'auto') return
    await todoStore.completeAutoTask(task.id as string, task.deadline)
    setAutoTasks(autoTasks.filter(t => t.id !== task.id))
    showToast('success', 'משימה בוצעה', '✅')
  }

  const isTaskSnoozed = useCallback((task: CombinedTask): boolean => {
    if (task.taskType !== 'user') return false
    return !!task.snoozedUntil && task.snoozedUntil > new Date().toISOString()
  }, [])

  // Drag and drop handlers
  const handleDragStart = (task: CombinedTask) => {
    if (task.taskType === 'auto') return
    setDraggedTask(task)
  }

  const handleDragOver = (e: React.DragEvent, quadrant: EisenhowerQuadrant) => {
    e.preventDefault()
    setDragOverQuadrant(quadrant)
  }

  const handleDragLeave = () => { setDragOverQuadrant(null) }

  const handleTaskDragOver = (e: React.DragEvent, taskId: string | number) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverTaskId(taskId)
  }

  const handleTaskDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    setDragOverTaskId(null)
  }

  const handleTaskDrop = async (e: React.DragEvent, targetTask: CombinedTask) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverQuadrant(null)
    setDragOverTaskId(null)
    if (!draggedTask) return
    if (draggedTask.quadrant === targetTask.quadrant) {
      await changeTaskPriority(draggedTask, targetTask.priority)
    } else {
      await moveTaskToQuadrant(draggedTask, targetTask.quadrant as EisenhowerQuadrant)
      await changeTaskPriority(draggedTask, targetTask.priority)
    }
    setDraggedTask(null)
  }

  const handleDrop = async (e: React.DragEvent, quadrant: EisenhowerQuadrant) => {
    e.preventDefault()
    setDragOverQuadrant(null)
    setDragOverTaskId(null)
    if (draggedTask && draggedTask.quadrant !== quadrant) {
      await moveTaskToQuadrant(draggedTask, quadrant)
    }
    setDraggedTask(null)
  }

  const handleDragEnd = () => {
    setDraggedTask(null)
    setDragOverQuadrant(null)
    setDragOverTaskId(null)
  }

  // Combine and group tasks by quadrant
  const getAllCombinedTasks = (includeSnoozed = false): CombinedTask[] => {
    const combined: CombinedTask[] = [
      ...userTasks.map(t => ({ ...t, id: t.id, taskType: 'user' as const })),
      ...autoTasks.map(t => ({
        id: t.id, title: t.title, completed: false, priority: t.priority,
        quadrant: t.quadrant, deadline: t.deadline, createdAt: t.createdAt,
        taskType: 'auto' as const, autoType: t.type, link: t.link, month: t.month,
      })),
    ]
    let filtered = combined
    if (!showCompleted) {
      filtered = filtered.filter(t => t.taskType === 'auto' || !t.completed)
    }
    if (!includeSnoozed) {
      filtered = filtered.filter(t => !isTaskSnoozed(t))
    }
    return filtered
  }

  const snoozedCount = getAllCombinedTasks(true).filter(t => isTaskSnoozed(t)).length

  const getTasksForQuadrant = (quadrant: EisenhowerQuadrant): CombinedTask[] => {
    return getAllCombinedTasks(showSnoozed)
      .filter(t => t.quadrant === quadrant)
      .sort((a, b) => {
        const pv = (p: Priority) => p === 'high' ? 3 : p === 'medium' ? 2 : 1
        const pd = pv(b.priority) - pv(a.priority)
        if (pd !== 0) return pd
        if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        return 0
      })
  }

  const activeTaskCount = userTasks.filter(t => !t.completed).length + autoTasks.length

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
              placeholder="הוסף משימה חדשה... (השתמש ב@שם כדי להאציל)"
              style={{
                flex: 1, minWidth: '200px', padding: '0.75rem',
                borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '1rem',
              }}
            />
            <select
              value={newTaskQuadrant}
              onChange={(e) => setNewTaskQuadrant(e.target.value as EisenhowerQuadrant)}
              style={{
                padding: '0.75rem', borderRadius: '0.375rem',
                border: '1px solid #d1d5db', fontSize: '0.875rem', background: 'white',
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
        <section style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#6b7280', cursor: 'pointer' }}>
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} style={{ width: '1rem', height: '1rem' }} />
            הצג הושלמו
          </label>
          {snoozedCount > 0 && (
            <button
              onClick={() => setShowSnoozed(!showSnoozed)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8rem',
                color: showSnoozed ? '#7c3aed' : '#9ca3af',
                background: showSnoozed ? '#ede9fe' : '#f9fafb',
                border: `1px solid ${showSnoozed ? '#c4b5fd' : '#e5e7eb'}`,
                padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer',
              }}
            >
              😴 {snoozedCount} מוסתרות
            </button>
          )}
          {partnerUid && (
            <span style={{ fontSize: '0.8rem', color: '#059669', background: '#ecfdf5', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
              👥 שותף/ה: {partnerEmail}
            </span>
          )}
          {bots.length > 0 && (
            <span style={{ fontSize: '0.8rem', color: '#1e40af', background: '#eff6ff', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
              🤖 {bots.length} בוטים
            </span>
          )}
        </section>

        {/* Eisenhower Matrix Grid */}
        <section style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
              <span>← חשוב</span>
              <span style={{ width: '2rem' }}></span>
              <span>לא חשוב →</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto', gap: '0.75rem' }}>
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
                    background: isDragOver ? q.bgColor : '#fff',
                    minHeight: '200px', display: 'flex', flexDirection: 'column',
                    transition: 'border-color 0.2s, background 0.2s',
                    boxShadow: isDragOver ? `0 0 0 3px ${q.borderColor}` : 'none',
                  }}
                >
                  <div style={{
                    padding: '0.75rem 1rem', background: q.bgColor,
                    borderTopLeftRadius: '0.625rem', borderTopRightRadius: '0.625rem',
                    borderBottom: `1px solid ${q.borderColor}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <span style={{ fontSize: '1rem', marginLeft: '0.375rem' }}>{q.icon}</span>
                      <span style={{ fontWeight: 600, color: q.color, fontSize: '0.95rem' }}>{q.title}</span>
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem', marginRight: '0.5rem' }}>{q.subtitle}</span>
                    </div>
                    <span style={{
                      fontSize: '0.75rem', background: tasks.length > 0 ? q.color : '#d1d5db',
                      color: '#fff', padding: '0.125rem 0.5rem', borderRadius: '1rem', fontWeight: 600,
                    }}>
                      {tasks.length}
                    </span>
                  </div>

                  <div style={{
                    padding: '0.5rem', flex: 1, display: 'flex', flexDirection: 'column',
                    gap: '0.375rem', overflowY: 'auto', maxHeight: '350px',
                  }}>
                    {tasks.length === 0 ? (
                      <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#d1d5db', fontSize: '0.85rem', fontStyle: 'italic',
                      }}>
                        {draggedTask ? 'שחרר כאן' : 'אין משימות'}
                      </div>
                    ) : (
                      tasks.map((task, idx) => {
                        const prevTask = idx > 0 ? tasks[idx - 1] : null
                        const showSeparator = prevTask && prevTask.priority !== task.priority
                        const priorityLabels: Record<Priority, string> = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' }
                        return (
                          <div key={task.id}>
                            {showSeparator && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.125rem 0.5rem', fontSize: '0.65rem', color: '#9ca3af' }}>
                                <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                                <span>{priorityLabels[task.priority]}</span>
                                <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                              </div>
                            )}
                            <TaskCard
                              task={task}
                              quadrant={q}
                              currentUid={currentUid}
                              partnerEmail={partnerEmail}
                              draggedTaskId={draggedTask?.id ?? null}
                              isDropTarget={dragOverTaskId === task.id && !!draggedTask && draggedTask.id !== task.id}
                              isSnoozed={isTaskSnoozed(task)}
                              snoozeMenuOpen={snoozeMenuTaskId === task.id}
                              snoozeMenuRef={snoozeMenuRef}
                              partnerUid={partnerUid}
                              onToggle={toggleUserTask}
                              onDelete={deleteUserTask}
                              onMarkAutoTaskDone={markAutoTaskDone}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              onDragOver={handleTaskDragOver}
                              onDragLeave={handleTaskDragLeave}
                              onDrop={handleTaskDrop}
                              onSnoozeMenuToggle={setSnoozeMenuTaskId}
                              onSnooze={snoozeTask}
                              onUnsnooze={unsnoozeTask}
                              onDelegate={(t) => setDelegatePickerTask(t)}
                              onUndelegate={undelegateTask}
                            />
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
              <span>↑ דחוף &nbsp;&nbsp;&nbsp;&nbsp; לא דחוף ↓</span>
            </div>
          </div>
        </section>
      </div>

      {/* Delegate picker modal */}
      {delegatePickerTask && (
        <DelegatePickerModal
          partnerUid={partnerUid}
          partnerEmail={partnerEmail}
          bots={bots}
          onSelect={handleDelegateSelect}
          onClose={() => setDelegatePickerTask(null)}
        />
      )}
    </main>
  )
}
