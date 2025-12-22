'use client'

import React, { useEffect, useState, useRef } from 'react'
import { projectStore } from '@/app/stores/projectStore'
import { harvestTaskStore } from '@/app/stores/harvestTaskStore'
import { timeEntryStore } from '@/app/stores/timeEntryStore'
import { timerStore, type ActiveTimer } from '@/app/stores/timerStore'
import { businessStore } from '@/app/stores/businessStore'
import type { Project, HarvestTask, TimeEntry, Business } from '@/app/db/financeDB'
import TimeEntryForm, { type TimeEntryFormData } from './TimeEntryForm'
import * as XLSX from 'xlsx'

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

function getMonthDates(monthOffset: number = 0): { start: string; end: string; monthName: string } {
  const now = new Date()
  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)

  const year = targetDate.getFullYear()
  const month = targetDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

  return {
    start: formatLocalDate(firstDay),
    end: formatLocalDate(lastDay),
    monthName: `${monthNames[month]} ${year}`,
  }
}

type ViewMode = 'daily' | 'weekly' | 'monthly'

export default function TimingTab({ businessId }: TimingTabProps) {
  const [business, setBusiness] = useState<Business | null>(null)
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
  const [viewMode, setViewMode] = useState<ViewMode>('weekly')
  const [selectedDate, setSelectedDate] = useState(formatLocalDate(new Date()))
  const [monthOffset, setMonthOffset] = useState(0)

  // Load business
  useEffect(() => {
    const load = async () => {
      const b = await businessStore.getById(businessId)
      setBusiness(b || null)
    }
    void load()
  }, [businessId])

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

  // Load entries based on view mode
  useEffect(() => {
    void loadWeekEntries()
  }, [businessId, weekOffset, monthOffset, selectedDate, viewMode])

  const handleStart = async () => {
    if (!selectedTaskId) return

    // If there's an active timer, stop it first
    if (activeTimer) {
      await handleStop()
    }

    const timer: ActiveTimer = {
      projectId: selectedProjectId!,
      taskId: selectedTaskId,
      startedAt: new Date().toISOString(),
    }
    setActiveTimer(timer)
    timerStore.set(timer)
  }

  const handleStartFromEntry = async (entry: WeekEntry) => {
    // If there's an active timer, stop it first
    if (activeTimer) {
      await handleStop()
    }

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
    let start: string
    let end: string

    if (viewMode === 'daily') {
      start = selectedDate
      end = selectedDate
    } else if (viewMode === 'monthly') {
      const dates = getMonthDates(monthOffset)
      start = dates.start
      end = dates.end
    } else {
      const dates = getWeekDates(weekOffset)
      start = dates.start
      end = dates.end
    }

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

    // Calculate start and end times
    const startDate = new Date(activeTimer.startedAt)
    const endDate = new Date()
    const startTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
    const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`

    await timeEntryStore.add({
      taskId: activeTimer.taskId,
      date: today,
      startTime,
      endTime,
      hours,
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
        taskId: formData.taskId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        hours,
      })
    } else {
      // Create new
      await timeEntryStore.add({
        taskId: formData.taskId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        hours,
      })
    }

    setFormData(null)
    setEditingEntry(null)
    await loadWeekEntries()
  }

  const handleEditEntry = async (entry: WeekEntry) => {
    setEditingEntry(entry)
    // Get the task to find its projectId
    const task = await harvestTaskStore.getById(entry.taskId)
    if (!task) return

    // Load tasks for this project
    const projectTasks = await harvestTaskStore.getActiveByProjectId(task.projectId)
    setFormTasks(projectTasks)

    setFormData({
      projectId: task.projectId,
      taskId: entry.taskId,
      date: entry.date,
      startTime: entry.startTime || '09:00',
      endTime: entry.endTime || '10:00',
    })
  }

  const handleDeleteEntry = async () => {
    if (!editingEntry) return
    await timeEntryStore.delete(editingEntry.id!)
    setEditingEntry(null)
    setFormData(null)
    await loadWeekEntries()
  }

  const handleExportToExcel = (projectName: string, projectEntries: WeekEntry[]) => {
    if (!business) return

    const monthData = getMonthDates(monthOffset)

    // Sort entries by date ascending
    const sortedEntries = [...projectEntries].sort((a, b) => a.date.localeCompare(b.date))

    // Group entries by task
    const taskGroups = new Map<string, { taskName: string; entries: WeekEntry[]; total: number }>()

    sortedEntries.forEach(entry => {
      if (!taskGroups.has(entry.taskName)) {
        taskGroups.set(entry.taskName, {
          taskName: entry.taskName,
          entries: [],
          total: 0,
        })
      }
      const task = taskGroups.get(entry.taskName)!
      task.entries.push(entry)
      task.total += entry.hours
    })

    // Create worksheet data
    const wsData: any[][] = []

    // Header
    wsData.push([projectName])
    wsData.push([monthData.monthName])
    wsData.push([]) // Empty row

    // Summary header (RTL order)
    wsData.push(['סה"כ שעות', 'שעות סיום', 'שעות התחלה', 'תאריך', 'משימה'])

    // Data rows
    let projectTotal = 0

    Array.from(taskGroups.values()).forEach(task => {
      task.entries.forEach(entry => {
        // RTL order: Hours, End Time, Start Time, Date, Task
        wsData.push([
          formatHours(entry.hours),
          entry.endTime,
          entry.startTime,
          formatDisplayDate(entry.date),
          task.taskName,
        ])
        projectTotal += entry.hours
      })
    })

    // Project total
    wsData.push([formatHours(projectTotal), '', '', `סה"כ ${projectName}:`, ''])

    // Create workbook
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Set RTL mode
    if (!ws['!views']) ws['!views'] = []
    ws['!views'][0] = { rightToLeft: true }

    // Set column widths (RTL order)
    ws['!cols'] = [
      { wch: 12 }, // Hours
      { wch: 12 }, // End time
      { wch: 12 }, // Start time
      { wch: 12 }, // Date
      { wch: 25 }, // Task
    ]

    // Style the header rows
    if (!ws['!rows']) ws['!rows'] = []
    ws['!rows'][0] = { hpt: 20 } // Project name row height
    ws['!rows'][1] = { hpt: 18 } // Month row height

    // Merge cells for header
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // Project name across all columns
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, // Month across all columns
    ]

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, monthData.monthName)

    // Generate file name
    const fileName = `${projectName}_${monthData.monthName.replace(' ', '_')}.xlsx`

    // Download file
    XLSX.writeFile(wb, fileName)
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
              onClick={() => void handleStart()}
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

      {/* View Mode Selector */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
        {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              padding: '0.5rem 1rem',
              background: viewMode === mode ? '#3b82f6' : '#f1f5f9',
              color: viewMode === mode ? 'white' : '#475569',
              border: `1px solid ${viewMode === mode ? '#3b82f6' : '#cbd5e1'}`,
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: viewMode === mode ? 600 : 400,
            }}
          >
            {mode === 'daily' ? 'יומי' : mode === 'weekly' ? 'שבועי' : 'חודשי'}
          </button>
        ))}
      </div>

      {/* Daily View */}
      {viewMode === 'daily' && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  fontSize: '0.9rem',
                }}
              />
              <button
                onClick={() => setSelectedDate(formatLocalDate(new Date()))}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dbeafe',
                  border: '1px solid #93c5fd',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#1e40af',
                }}
              >
                היום
              </button>
            </div>
            <span style={{ fontWeight: 500, color: '#64748b' }}>
              {formatHours(weekTotal)} שעות
            </span>
          </div>

          {/* Daily entries list */}
          {weekEntries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(() => {
                // Sort entries by start time
                const sortedEntries = [...weekEntries].sort((a, b) => {
                  // Handle entries without startTime (sort them to the end)
                  if (!a.startTime && !b.startTime) return 0
                  if (!a.startTime) return 1
                  if (!b.startTime) return -1
                  return a.startTime.localeCompare(b.startTime)
                })

                return sortedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1rem',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '0.95rem',
                    }}
                  >
                    <div
                      onClick={() => handleEditEntry(entry)}
                      style={{ flex: 1, cursor: 'pointer' }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        {entry.projectName}
                        <span style={{ color: '#64748b', margin: '0 0.5rem' }}>›</span>
                        {entry.taskName}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        {entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : formatHours(entry.hours) + ' שעות'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{formatHours(entry.hours)}</span>
                      <button
                        onClick={() => void handleStartFromEntry(entry)}
                        title="התחל טיימר עם אותו פרויקט ומשימה"
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.8rem',
                          background: '#ecfdf5',
                          border: '1px solid #6ee7b7',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          color: '#059669',
                        }}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                ))
              })()}
            </div>
          ) : (
            <p style={{ color: '#64748b', textAlign: 'center' }}>
              אין רישומי זמן ביום זה
            </p>
          )}
        </div>
      )}

      {/* Weekly View */}
      {viewMode === 'weekly' && (
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
                    onClick={() => void handleStartFromEntry(entry)}
                    title="התחל טיימר עם אותו פרויקט ומשימה"
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                      background: '#ecfdf5',
                      border: '1px solid #6ee7b7',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      color: '#059669',
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
      )}

      {/* Monthly View */}
      {viewMode === 'monthly' && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => setMonthOffset(monthOffset - 1)}
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
                {getMonthDates(monthOffset).monthName}
              </h3>
              <button
                onClick={() => setMonthOffset(monthOffset + 1)}
                disabled={monthOffset === 0}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.25rem',
                  cursor: monthOffset === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  opacity: monthOffset === 0 ? 0.5 : 1,
                }}
              >
                ◄
              </button>
              {monthOffset !== 0 && (
                <button
                  onClick={() => setMonthOffset(0)}
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
                  חודש נוכחי
                </button>
              )}
            </div>
            <span style={{ fontWeight: 500, color: '#64748b' }}>
              {formatHours(weekTotal)} שעות
            </span>
          </div>

          {/* Group entries by project */}
          {weekEntries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(() => {
                const projectGroups = new Map<string, { projectName: string; tasks: Map<string, { taskName: string; entries: WeekEntry[]; total: number }> }>()

                weekEntries.forEach(entry => {
                  if (!projectGroups.has(entry.projectName)) {
                    projectGroups.set(entry.projectName, {
                      projectName: entry.projectName,
                      tasks: new Map(),
                    })
                  }
                  const project = projectGroups.get(entry.projectName)!
                  if (!project.tasks.has(entry.taskName)) {
                    project.tasks.set(entry.taskName, {
                      taskName: entry.taskName,
                      entries: [],
                      total: 0,
                    })
                  }
                  const task = project.tasks.get(entry.taskName)!
                  task.entries.push(entry)
                  task.total += entry.hours
                })

                return Array.from(projectGroups.values()).map(project => {
                  const projectTotal = Array.from(project.tasks.values()).reduce((sum, task) => sum + task.total, 0)
                  const projectEntries = Array.from(project.tasks.values()).flatMap(task => task.entries)

                  return (
                    <div
                      key={project.projectName}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{
                        padding: '1rem',
                        background: '#e0f2fe',
                        borderBottom: '1px solid #bae6fd',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                          {project.projectName}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                            {formatHours(projectTotal)}
                          </span>
                          <button
                            onClick={() => handleExportToExcel(project.projectName, projectEntries)}
                            title="ייצא ל-Excel"
                            style={{
                              padding: '0.375rem 0.75rem',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: 500,
                            }}
                          >
                            📊 Excel
                          </button>
                        </div>
                      </div>
                      <div style={{ padding: '0.5rem' }}>
                        {Array.from(project.tasks.values()).map(task => (
                          <div
                            key={task.taskName}
                            style={{
                              padding: '0.75rem',
                              marginBottom: '0.5rem',
                              background: 'white',
                              borderRadius: '0.375rem',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '0.5rem',
                            }}>
                              <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>
                                {task.taskName}
                              </span>
                              <span style={{ fontWeight: 600 }}>
                                {formatHours(task.total)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {task.entries.map(entry => (
                                <div
                                  key={entry.id}
                                  onClick={() => handleEditEntry(entry)}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '0.375rem 0.5rem',
                                    fontSize: '0.85rem',
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    borderRadius: '0.25rem',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  <span>{formatDisplayDate(entry.date)}</span>
                                  <span>{formatHours(entry.hours)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          ) : (
            <p style={{ color: '#64748b', textAlign: 'center' }}>
              אין רישומי זמן בחודש זה
            </p>
          )}
        </div>
      )}

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
        />
      )}
    </div>
  )
}
