'use client'

import React, { useEffect, useState, useRef } from 'react'
import { projectStore } from '@/app/stores/projectStore'
import { harvestTaskStore } from '@/app/stores/harvestTaskStore'
import { timeEntryStore } from '@/app/stores/timeEntryStore'
import { timerStore, type ActiveTimer } from '@/app/stores/timerStore'
import type { Project, HarvestTask, TimeEntry } from '@/app/db/financeDB'
import TimeEntryForm, { type TimeEntryFormData } from './TimeEntryForm'

type TimingTabProps = {
  businessId: number
}

type WeekEntry = TimeEntry & {
  projectName: string
  taskName: string
}


function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

function getWeekDates(weekOffset: number = 0): { start: string; end: string; days: string[] } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  // Start from Sunday (day 0)
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - dayOfWeek + (weekOffset * 7))
  sunday.setHours(12, 0, 0, 0) // Use noon to avoid timezone issues

  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    days.push(formatLocalDate(d))
  }

  return {
    start: days[0],
    end: days[6],
    days,
  }
}

function formatWeekRange(days: string[]): string {
  const start = new Date(days[0])
  const end = new Date(days[6])
  const startStr = `${start.getDate()}/${start.getMonth() + 1}`
  const endStr = `${end.getDate()}/${end.getMonth() + 1}`
  return `${startStr} - ${endStr}`
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

export default function TimingTab({ businessId }: TimingTabProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<HarvestTask[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [weekEntries, setWeekEntries] = useState<WeekEntry[]>([])
  const [weekTotal, setWeekTotal] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [formData, setFormData] = useState<TimeEntryFormData | null>(null)
  const [formTasks, setFormTasks] = useState<HarvestTask[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [editingEntry, setEditingEntry] = useState<WeekEntry | null>(null)

  // Load projects
  useEffect(() => {
    const load = async () => {
      const p = await projectStore.getActiveByBusinessId(businessId)
      setProjects(p)
      if (p.length > 0 && !selectedProjectId) {
        setSelectedProjectId(p[0].id!)
      }
    }
    void load()
  }, [businessId])

  // Load tasks when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([])
      return
    }
    const load = async () => {
      const t = await harvestTaskStore.getActiveByProjectId(selectedProjectId)
      setTasks(t)
      if (t.length > 0) {
        setSelectedTaskId(t[0].id!)
      } else {
        setSelectedTaskId(null)
      }
    }
    void load()
  }, [selectedProjectId])

  // Load active timer from store
  useEffect(() => {
    const timer = timerStore.get()
    if (timer) {
      setActiveTimer(timer)
      setSelectedProjectId(timer.projectId)
      setSelectedTaskId(timer.taskId)
    }
  }, [])

  // Timer tick
  useEffect(() => {
    if (activeTimer) {
      const updateElapsed = () => {
        const started = new Date(activeTimer.startedAt).getTime()
        const now = Date.now()
        setElapsedSeconds(Math.floor((now - started) / 1000))
      }
      updateElapsed()
      intervalRef.current = setInterval(updateElapsed, 1000)
    } else {
      setElapsedSeconds(0)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [activeTimer])

  // Load week entries
  useEffect(() => {
    void loadWeekEntries()
  }, [businessId, weekOffset])

  const handleStart = () => {
    if (!selectedTaskId) return
    const timer: ActiveTimer = {
      projectId: selectedProjectId!,
      taskId: selectedTaskId,
      startedAt: new Date().toISOString(),
    }
    setActiveTimer(timer)
    timerStore.set(timer)
  }

  const handleStartFromEntry = async (entry: WeekEntry) => {
    if (activeTimer) return
    // Find the project for this task
    const task = await harvestTaskStore.getById(entry.taskId)
    if (!task) return

    setSelectedProjectId(task.projectId)
    setSelectedTaskId(entry.taskId)

    const timer: ActiveTimer = {
      projectId: task.projectId,
      taskId: entry.taskId,
      startedAt: new Date().toISOString(),
    }
    setActiveTimer(timer)
    timerStore.set(timer)
  }

  const loadWeekEntries = async () => {
    const { start, end } = getWeekDates(weekOffset)
    const entries = await timeEntryStore.getByDateRange(start, end)
    const allProjects = await projectStore.getByBusinessId(businessId)
    const projectIds = allProjects.map(p => p.id!)
    const allTasks = await Promise.all(projectIds.map(pid => harvestTaskStore.getByProjectId(pid)))
    const businessTaskIds = new Set(allTasks.flat().map(t => t.id!))

    const enriched: WeekEntry[] = []
    for (const entry of entries) {
      if (!businessTaskIds.has(entry.taskId)) continue
      const task = allTasks.flat().find(t => t.id === entry.taskId)
      const project = allProjects.find(p => p.id === task?.projectId)
      enriched.push({
        ...entry,
        projectName: project?.name || '',
        taskName: task?.name || '',
      })
    }
    setWeekEntries(enriched.sort((a, b) => b.date.localeCompare(a.date)))
    setWeekTotal(enriched.reduce((sum, e) => sum + e.hours, 0))
  }

  const handleStop = async () => {
    if (!activeTimer) return

    const hours = elapsedSeconds / 3600
    const today = formatLocalDate(new Date())

    await timeEntryStore.add({
      taskId: activeTimer.taskId,
      date: today,
      hours,
      notes: '',
    })

    setActiveTimer(null)
    timerStore.clear()
    await loadWeekEntries()
  }

  const handleOpenManualEntry = () => {
    const today = formatLocalDate(new Date())
    setEditingEntry(null)
    setFormData({
      projectId: selectedProjectId,
      taskId: selectedTaskId,
      date: today,
      startTime: '09:00',
      endTime: '10:00',
    })
    if (selectedProjectId) {
      void harvestTaskStore.getActiveByProjectId(selectedProjectId).then(setFormTasks)
    }
  }

  const handleFormProjectChange = async (projectId: number) => {
    const t = await harvestTaskStore.getActiveByProjectId(projectId)
    setFormTasks(t)
  }

  const handleSaveEntry = async () => {
    if (!formData?.taskId || !formData.date || !formData.startTime || !formData.endTime) return

    const [startH, startM] = formData.startTime.split(':').map(Number)
    const [endH, endM] = formData.endTime.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM
    const hours = (endMinutes - startMinutes) / 60

    if (hours <= 0) return

    if (editingEntry) {
      // Update existing
      await timeEntryStore.update(editingEntry.id!, {
        date: formData.date,
        hours,
        notes: `${formData.startTime} - ${formData.endTime}`,
      })
    } else {
      // Create new
      await timeEntryStore.add({
        taskId: formData.taskId,
        date: formData.date,
        hours,
        notes: `${formData.startTime} - ${formData.endTime}`,
      })
    }

    setFormData(null)
    setEditingEntry(null)
    await loadWeekEntries()
  }

  const handleEditEntry = (entry: WeekEntry) => {
    // Parse hours back to start/end times (approximate, using 09:00 as base)
    const totalMinutes = Math.round(entry.hours * 60)
    const endMinutes = 9 * 60 + totalMinutes
    const endH = Math.floor(endMinutes / 60)
    const endM = endMinutes % 60

    // Try to parse from notes if available (format: "HH:MM - HH:MM")
    let startTime = '09:00'
    let endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`

    if (entry.notes) {
      const match = entry.notes.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/)
      if (match) {
        startTime = match[1]
        endTime = match[2]
      }
    }

    setEditingEntry(entry)
    setFormData({
      projectId: null,
      taskId: entry.taskId,
      date: entry.date,
      startTime,
      endTime,
    })
  }

  const handleDeleteEntry = async () => {
    if (!editingEntry) return
    await timeEntryStore.delete(editingEntry.id!)
    setEditingEntry(null)
    setFormData(null)
    await loadWeekEntries()
  }

  const { days } = getWeekDates(weekOffset)
  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  const isCurrentWeek = weekOffset === 0

  return (
    <div>
      {/* Timer Section */}
      <div style={{
        background: activeTimer ? '#ecfdf5' : '#f8fafc',
        border: `1px solid ${activeTimer ? '#6ee7b7' : '#e2e8f0'}`,
        borderRadius: '0.75rem',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(Number(e.target.value))}
            disabled={!!activeTimer}
            style={{
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '0.95rem',
              minWidth: '150px',
            }}
          >
            <option value="">בחר פרויקט</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={selectedTaskId || ''}
            onChange={(e) => setSelectedTaskId(Number(e.target.value))}
            disabled={!!activeTimer || !selectedProjectId}
            style={{
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '0.95rem',
              minWidth: '150px',
            }}
          >
            <option value="">בחר משימה</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{
            fontSize: '2.5rem',
            fontFamily: 'monospace',
            fontWeight: 600,
            color: activeTimer ? '#059669' : '#64748b',
          }}>
            {formatTime(elapsedSeconds)}
          </div>

          {activeTimer ? (
            <button
              onClick={() => void handleStop()}
              style={{
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
              }}
            >
              עצור
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!selectedTaskId}
              style={{
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: selectedTaskId ? '#059669' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: selectedTaskId ? 'pointer' : 'not-allowed',
              }}
            >
              התחל
            </button>
          )}

          <button
            onClick={handleOpenManualEntry}
            disabled={!!activeTimer}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.9rem',
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              cursor: activeTimer ? 'not-allowed' : 'pointer',
              opacity: activeTimer ? 0.5 : 1,
            }}
          >
            + הוספה ידנית
          </button>
        </div>

        {projects.length === 0 && (
          <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.9rem' }}>
            אין פרויקטים. צור פרויקט בלשונית הגדרות.
          </p>
        )}
        {selectedProjectId && tasks.length === 0 && (
          <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.9rem' }}>
            אין משימות בפרויקט זה. צור משימה בלשונית הגדרות.
          </p>
        )}
      </div>

      {/* Week Summary */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setWeekOffset(weekOffset - 1)}
              style={{
                padding: '0.25rem 0.5rem',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              ►
            </button>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              {isCurrentWeek ? 'השבוע הנוכחי' : formatWeekRange(days)}
            </h3>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              disabled={isCurrentWeek}
              style={{
                padding: '0.25rem 0.5rem',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '0.25rem',
                cursor: isCurrentWeek ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                opacity: isCurrentWeek ? 0.5 : 1,
              }}
            >
              ◄
            </button>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekOffset(0)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: '#dbeafe',
                  border: '1px solid #93c5fd',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: '#1e40af',
                }}
              >
                היום
              </button>
            )}
          </div>
          <span style={{ fontWeight: 500, color: '#64748b' }}>
            {formatHours(weekTotal)} שעות
          </span>
        </div>

        {/* Week days grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}>
          {days.map((day, i) => {
            const dayEntries = weekEntries.filter(e => e.date === day)
            const dayTotal = dayEntries.reduce((sum, e) => sum + e.hours, 0)
            const isToday = day === formatLocalDate(new Date())

            return (
              <div
                key={day}
                style={{
                  padding: '0.5rem',
                  background: isToday ? '#dbeafe' : '#f8fafc',
                  border: `1px solid ${isToday ? '#93c5fd' : '#e2e8f0'}`,
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{dayNames[i]}</div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  {dayTotal > 0 ? formatHours(dayTotal) : '-'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Entries list */}
        {weekEntries.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {weekEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  fontSize: '0.9rem',
                }}
              >
                <div
                  onClick={() => handleEditEntry(entry)}
                  style={{ flex: 1, cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 500 }}>{entry.projectName}</span>
                  <span style={{ color: '#64748b', margin: '0 0.5rem' }}>›</span>
                  <span>{entry.taskName}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ color: '#64748b' }}>{formatDisplayDate(entry.date)}</span>
                  <span style={{ fontWeight: 600 }}>{formatHours(entry.hours)}</span>
                  <button
                    onClick={() => handleStartFromEntry(entry)}
                    disabled={!!activeTimer}
                    title="התחל טיימר עם אותו פרויקט ומשימה"
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                      background: activeTimer ? '#e5e7eb' : '#ecfdf5',
                      border: '1px solid #6ee7b7',
                      borderRadius: '0.25rem',
                      cursor: activeTimer ? 'not-allowed' : 'pointer',
                      color: '#059669',
                      opacity: activeTimer ? 0.5 : 1,
                    }}
                  >
                    ▶
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', textAlign: 'center' }}>
            אין רישומי זמן השבוע
          </p>
        )}
      </div>

      {/* Time Entry Form Modal */}
      {formData && (
        <TimeEntryForm
          isOpen={!!formData}
          onClose={() => { setFormData(null); setEditingEntry(null) }}
          onSave={() => void handleSaveEntry()}
          onDelete={editingEntry ? () => void handleDeleteEntry() : undefined}
          title={editingEntry ? 'עריכת רישום' : 'הוספת רישום ידני'}
          data={formData}
          onChange={setFormData}
          projects={projects}
          tasks={formTasks}
          onProjectChange={handleFormProjectChange}
          showProjectTask={!editingEntry}
          projectName={editingEntry?.projectName}
          taskName={editingEntry?.taskName}
        />
      )}
    </div>
  )
}
