'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import { todoStore, type UserTask, type AutoTask } from '@/app/stores/todoStore'

type Priority = 'low' | 'medium' | 'high'

export default function TodoPage() {
  const { showToast } = useToast()
  const [userTasks, setUserTasks] = useState<UserTask[]>([])
  const [autoTasks, setAutoTasks] = useState<AutoTask[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium')
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'date' | 'priority'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showCompleted, setShowCompleted] = useState(true)

  // Load tasks on mount
  useEffect(() => {
    loadTasks()
  }, [])

  const loadTasks = async () => {
    setLoading(true)

    // Load user tasks from store
    const tasks = await todoStore.getAllTasks()
    setUserTasks(tasks)

    // Load auto-generated tasks from store
    const autoTasksData = await todoStore.getAutoTasks()
    setAutoTasks(autoTasksData)

    setLoading(false)
  }

  const handleAddUserTask = async () => {
    if (!newTaskTitle.trim()) return

    const newTask = await todoStore.addTask(newTaskTitle, newTaskPriority)
    setUserTasks([newTask, ...userTasks])
    setNewTaskTitle('')
    setNewTaskPriority('medium')
    showToast('success', 'משימה נוספה', '✅')
  }

  const getPriorityColor = (priority: Priority): string => {
    switch (priority) {
      case 'high':
        return '#ef4444'
      case 'medium':
        return '#f97316'
      case 'low':
        return '#10b981'
    }
  }

  const getPriorityLabel = (priority: Priority): string => {
    switch (priority) {
      case 'high':
        return 'גבוהה'
      case 'medium':
        return 'בינונית'
      case 'low':
        return 'נמוכה'
    }
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'היום'
    if (diffDays === 1) return 'אתמול'
    if (diffDays < 7) return `לפני ${diffDays} ימים`
    if (diffDays < 30) return `לפני ${Math.floor(diffDays / 7)} שבועות`
    return date.toLocaleDateString('he-IL')
  }

  const toggleUserTask = async (id: number) => {
    await todoStore.toggleTask(id)
    setUserTasks(userTasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task)))
  }

  const deleteUserTask = async (id: number) => {
    await todoStore.deleteTask(id)
    setUserTasks(userTasks.filter((task) => task.id !== id))
    showToast('success', 'משימה נמחקה', '🗑️')
  }


  const getPriorityValue = (priority: Priority): number => {
    switch (priority) {
      case 'high':
        return 3
      case 'medium':
        return 2
      case 'low':
        return 1
    }
  }

  const handleSort = (field: 'date' | 'priority') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const getAllTasks = () => {
    // Helper to convert MM/YYYY to comparable timestamp
    const monthToTimestamp = (month: string): number => {
      const [mm, yyyy] = month.split('/')
      return new Date(`${yyyy}-${mm}-01`).getTime()
    }

    // Combine user tasks and auto tasks with type indicator
    type CombinedTask = (UserTask & { taskType: 'user' }) | ({
      id: string | number
      title: string
      completed: boolean
      priority: Priority
      createdAt: string
      taskType: 'auto'
      autoType: AutoTask['type']
      link: string
      month: string
    })

    const allTasks: CombinedTask[] = [
      ...userTasks.map((t) => ({ ...t, taskType: 'user' as const })),
      ...autoTasks.map((t) => ({
        id: t.id,
        title: t.title,
        completed: false,
        priority: t.priority,
        createdAt: t.createdAt,
        taskType: 'auto' as const,
        autoType: t.type,
        link: t.link,
        month: t.month,
      })),
    ]

    let filtered = showCompleted ? allTasks : allTasks.filter((t) => t.taskType === 'auto' || !t.completed)

    return filtered.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'date') {
        // Auto tasks: always sort by month oldest first
        // User tasks: sort by createdAt respecting sortOrder
        if (a.taskType === 'auto' && b.taskType === 'auto') {
          comparison = monthToTimestamp(a.month) - monthToTimestamp(b.month) // Oldest first
        } else if (a.taskType === 'user' && b.taskType === 'user') {
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          comparison = sortOrder === 'desc' ? comparison : -comparison
        } else {
          // Mixed: auto tasks come before user tasks
          return a.taskType === 'auto' ? -1 : 1
        }
      } else {
        comparison = getPriorityValue(b.priority) - getPriorityValue(a.priority)
        return sortOrder === 'desc' ? comparison : -comparison
      }
      return comparison
    })
  }

  const getAutoTaskIcon = (type: AutoTask['type']): string => {
    switch (type) {
      case 'missing-file':
        return '📄'
      case 'uncategorized':
        return '🏷️'
      case 'expected-payment':
        return '💳'
      case 'other':
        return '⚠️'
    }
  }

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>משימות</h1>
          <p>ניהול משימות אישיות ומשימות שנוצרו אוטומטית</p>
        </header>

        {/* Add new user task */}
        <section style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddUserTask()}
              placeholder="הוסף משימה חדשה..."
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem',
              }}
            />
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
              style={{
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white',
              }}
            >
              <option value="low">עדיפות נמוכה</option>
              <option value="medium">עדיפות בינונית</option>
              <option value="high">עדיפות גבוהה</option>
            </select>
            <button onClick={handleAddUserTask} className="file-picker" style={{ margin: 0 }}>
              הוסף
            </button>
          </div>
        </section>

        {/* All tasks */}
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
            משימות ({userTasks.filter((t) => !t.completed).length + autoTasks.length})
          </h2>
          {userTasks.length === 0 && autoTasks.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#9ca3af',
                border: '1px dashed #d1d5db',
                borderRadius: '0.5rem',
              }}
            >
              אין משימות. הוסף משימה חדשה למעלה.
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={showCompleted}
                        onChange={(e) => setShowCompleted(e.target.checked)}
                        style={{ cursor: 'pointer', width: '1.25rem', height: '1.25rem' }}
                        title="הצג הושלמו"
                      />
                    </th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '40px' }}></th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>משימה</th>
                    <th
                      style={{
                        padding: '0.75rem',
                        textAlign: 'center',
                        width: '100px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontWeight: 600,
                      }}
                      onClick={() => handleSort('priority')}
                    >
                      עדיפות {sortBy === 'priority' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th
                      style={{
                        padding: '0.75rem',
                        textAlign: 'center',
                        width: '120px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontWeight: 600,
                      }}
                      onClick={() => handleSort('date')}
                    >
                      תאריך {sortBy === 'date' && (sortOrder === 'desc' ? '↓' : '↑')}
                    </th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {getAllTasks().map((task) => (
                    <tr
                      key={task.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: task.completed ? '#f8fafc' : 'white',
                      }}
                    >
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {task.taskType === 'user' ? (
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => toggleUserTask(task.id)}
                            style={{
                              width: '1.25rem',
                              height: '1.25rem',
                              cursor: 'pointer',
                            }}
                          />
                        ) : null}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '1.25rem' }}>
                        {task.taskType === 'auto' ? getAutoTaskIcon(task.autoType!) : '👤'}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem',
                          textDecoration: task.completed ? 'line-through' : 'none',
                          color: task.completed ? '#9ca3af' : '#1f2937',
                        }}
                      >
                        {task.taskType === 'auto' ? (
                          <a href={task.link} style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                            {task.title}
                          </a>
                        ) : (
                          task.title
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            background: getPriorityColor(task.priority) + '20',
                            color: getPriorityColor(task.priority),
                            fontWeight: 600,
                          }}
                        >
                          {getPriorityLabel(task.priority)}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                        {formatDate(task.createdAt)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {task.taskType === 'user' && (
                          <button
                            onClick={() => deleteUserTask(task.id)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.875rem',
                              border: '1px solid #fecaca',
                              borderRadius: '0.25rem',
                              background: 'white',
                              cursor: 'pointer',
                              color: '#dc2626',
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
