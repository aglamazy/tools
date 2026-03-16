'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import { todoStore, type UserTask } from '@/app/stores/todoStore'

interface ActiveTimer {
  taskId: number
  taskTitle: string
  startedAt: string
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function FloatingTaskTimer() {
  const [timer, setTimer] = useState<ActiveTimer | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [showSelector, setShowSelector] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load persisted timer on mount
  useEffect(() => {
    appSettingsStore.getActiveTaskTimer().then(t => {
      if (t) setTimer(t)
    })
  }, [])

  // Tick elapsed time
  useEffect(() => {
    if (timer) {
      const tick = () => setElapsed(Date.now() - new Date(timer.startedAt).getTime())
      tick()
      intervalRef.current = setInterval(tick, 1000)
      return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    } else {
      setElapsed(0)
    }
  }, [timer])

  const startTimer = useCallback(async (task: UserTask) => {
    const t: ActiveTimer = {
      taskId: task.id!,
      taskTitle: task.title,
      startedAt: new Date().toISOString(),
    }
    await appSettingsStore.setActiveTaskTimer(t)
    setTimer(t)
    setShowSelector(false)
  }, [])

  const stopTimer = useCallback(async () => {
    await appSettingsStore.setActiveTaskTimer(null)
    setTimer(null)
  }, [])

  if (timer) {
    return (
      <button className="floating-timer-pill" onClick={stopTimer} title="Stop timer">
        <span className="floating-timer-dot" />
        <span className="floating-timer-title">
          {timer.taskTitle.length > 18 ? timer.taskTitle.slice(0, 18) + '…' : timer.taskTitle}
        </span>
        <span className="floating-timer-time">{formatElapsed(elapsed)}</span>
        <span className="floating-timer-stop">◼</span>
      </button>
    )
  }

  return (
    <>
      <button
        className="floating-timer-play"
        onClick={() => setShowSelector(true)}
        title="Start task timer"
      >
        ▶
      </button>
      {showSelector && (
        <TaskSelector
          onSelect={startTimer}
          onClose={() => setShowSelector(false)}
        />
      )}
    </>
  )
}

function TaskSelector({ onSelect, onClose }: {
  onSelect: (task: UserTask) => void
  onClose: () => void
}) {
  const [tasks, setTasks] = useState<UserTask[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    todoStore.getAllTasks().then(all => {
      const now = new Date().toISOString().split('T')[0]
      setTasks(all.filter(t => !t.completed && (!t.snoozedUntil || t.snoozedUntil <= now)))
      setLoading(false)
    })
  }, [])

  const filtered = filter
    ? tasks.filter(t => t.title.toLowerCase().includes(filter.toLowerCase()))
    : tasks

  return (
    <div className="more-menu-overlay" onClick={onClose}>
      <div className="task-selector" onClick={e => e.stopPropagation()}>
        <h3>בחר משימה</h3>
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="חיפוש..."
          className="task-selector-search"
          autoFocus
        />
        <div className="task-selector-list">
          {loading && <p className="task-selector-empty">טוען...</p>}
          {!loading && filtered.length === 0 && (
            <p className="task-selector-empty">אין משימות פתוחות</p>
          )}
          {filtered.map(task => (
            <button
              key={task.id}
              className="task-selector-item"
              onClick={() => onSelect(task)}
            >
              <span className={`task-selector-priority task-priority-${task.priority}`} />
              <span>{task.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
