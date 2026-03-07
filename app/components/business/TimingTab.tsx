'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { projectStore } from '@/app/stores/projectStore'
import { harvestTaskStore } from '@/app/stores/harvestTaskStore'
import { timeEntryStore } from '@/app/stores/timeEntryStore'
import { timerStore, type ActiveTimer } from '@/app/stores/timerStore'
import { businessStore } from '@/app/stores/businessStore'
import type { Project, HarvestTask, TimeEntry, Business } from '@/app/db/financeDB'
import TimeEntryForm, { type TimeEntryFormData } from './TimeEntryForm'
import FormModal, { FormField, inputStyle } from '../FormModal'
import HoursBar from './HoursBar'
import CalendarColumn from './CalendarColumn'
import {
  hasCalendarAccess,
  requestCalendarAccess,
  fetchCalendarEvents,
  type CalendarEvent,
} from '@/app/services/googleCalendarService'
import * as XLSX from 'xlsx'
import {
  formatLocalDate,
  formatDisplayDate,
  getDayName,
  adjustDate,
  formatTime,
  formatHours,
  getWeekDates,
  formatWeekRange,
  getMonthDates,
  getCalendarDays,
  DAY_NAMES_HE,
} from '@/app/lib/dateUtils'

type TimingTabProps = {
  businessId: number
}

type WeekEntry = TimeEntry & {
  projectName: string
  taskName: string
  projectColor: string
}

type ProjectSummary = {
  projectName: string
  totalHours: number
}


function calculateProjectSummaries(entries: WeekEntry[]): ProjectSummary[] {
  const projectMap = new Map<string, number>()

  entries.forEach(entry => {
    const current = projectMap.get(entry.projectName) || 0
    projectMap.set(entry.projectName, current + entry.hours)
  })

  return Array.from(projectMap.entries())
    .map(([projectName, totalHours]) => ({ projectName, totalHours }))
    .sort((a, b) => b.totalHours - a.totalHours)
}

type ViewMode = 'daily' | 'weekly' | 'monthly' | 'recent'

const VIEW_MODES: ViewMode[] = ['daily', 'weekly', 'monthly', 'recent']

export default function TimingTab({ businessId }: TimingTabProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Read initial state from URL params
  const initialViewMode = (VIEW_MODES.includes(searchParams.get('view') as ViewMode) ? searchParams.get('view') : 'weekly') as ViewMode
  const initialDate = searchParams.get('date') || formatLocalDate(new Date())
  const initialWeekOffset = Number(searchParams.get('wo')) || 0
  const initialMonthOffset = Number(searchParams.get('mo')) || 0

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
  const [weekOffset, setWeekOffset] = useState(initialWeekOffset)
  const [editingEntry, setEditingEntry] = useState<WeekEntry | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode)
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [monthOffset, setMonthOffset] = useState(initialMonthOffset)
  const [editingTask, setEditingTask] = useState<HarvestTask | null>(null)

  // Sync view state to URL params
  const updateUrlParams = useCallback((updates: Record<string, string | number>) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    for (const [key, val] of Object.entries(updates)) {
      if (val === 0 || val === '' || val === 'weekly') {
        params.delete(key)
      } else {
        params.set(key, String(val))
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, pathname, router])

  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    const prevMode = viewMode
    // Sync offsets when switching between views so we stay on the same date
    if (prevMode === 'daily' && newMode === 'weekly') {
      // Calculate week offset from selectedDate
      const sel = new Date(selectedDate + 'T12:00:00')
      const now = new Date()
      const selSunday = new Date(sel)
      selSunday.setDate(sel.getDate() - sel.getDay())
      const nowSunday = new Date(now)
      nowSunday.setDate(now.getDate() - now.getDay())
      const diffWeeks = Math.round((selSunday.getTime() - nowSunday.getTime()) / (7 * 24 * 60 * 60 * 1000))
      setWeekOffset(diffWeeks)
    } else if (prevMode === 'daily' && newMode === 'monthly') {
      const sel = new Date(selectedDate + 'T12:00:00')
      const now = new Date()
      setMonthOffset((sel.getFullYear() - now.getFullYear()) * 12 + sel.getMonth() - now.getMonth())
    } else if (prevMode === 'weekly' && newMode === 'daily') {
      // Jump to first day of the viewed week
      const { start } = getWeekDates(weekOffset)
      setSelectedDate(start)
    } else if (prevMode === 'monthly' && newMode === 'daily') {
      const { start } = getMonthDates(monthOffset)
      setSelectedDate(start)
    }
    setViewMode(newMode)
  }, [viewMode, selectedDate, weekOffset, monthOffset])

  useEffect(() => {
    updateUrlParams({
      view: viewMode,
      date: viewMode === 'daily' ? selectedDate : '',
      wo: viewMode === 'weekly' ? weekOffset : 0,
      mo: viewMode === 'monthly' ? monthOffset : 0,
    })
  }, [viewMode, selectedDate, weekOffset, monthOffset])

  // Calendar state
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState<string | undefined>()
  const [calendarConnected, setCalendarConnected] = useState(false)

  // Task dropdown state
  const [allTasks, setAllTasks] = useState<HarvestTask[]>([])
  const [showAllTasks, setShowAllTasks] = useState(false)
  const RECENT_TASKS_LIMIT = 5

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

  // Load tasks when project changes - sorted by recent usage
  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([])
      setAllTasks([])
      setShowAllTasks(false)
      return
    }
    const load = async () => {
      const fetchedTasks = await harvestTaskStore.getActiveByProjectId(selectedProjectId)

      // Get recent time entries to determine task usage order
      const recentEntries = await timeEntryStore.getRecent(50) // Get last 50 entries

      // Build a map of taskId -> most recent usage timestamp
      const taskUsage = new Map<number, string>()
      for (const entry of recentEntries) {
        const task = fetchedTasks.find(t => t.id === entry.taskId)
        if (task && !taskUsage.has(entry.taskId)) {
          taskUsage.set(entry.taskId, entry.date + (entry.startTime || ''))
        }
      }

      // Sort tasks: recently used first, then rest by creation date
      const recentlyUsedTasks = fetchedTasks
        .filter(t => taskUsage.has(t.id!))
        .sort((a, b) => (taskUsage.get(b.id!) || '').localeCompare(taskUsage.get(a.id!) || ''))

      const otherTasks = fetchedTasks
        .filter(t => !taskUsage.has(t.id!))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

      const sortedTasks = [...recentlyUsedTasks, ...otherTasks]
      setAllTasks(sortedTasks)
      setTasks(sortedTasks.slice(0, RECENT_TASKS_LIMIT))
      setShowAllTasks(false)

      if (sortedTasks.length > 0 && !selectedTaskId) {
        setSelectedTaskId(sortedTasks[0].id!)
      } else if (sortedTasks.length === 0) {
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

  // Check calendar connection on mount
  useEffect(() => {
    hasCalendarAccess().then(setCalendarConnected)
  }, [])

  // Load calendar events when in daily view and date changes
  useEffect(() => {
    if (viewMode !== 'daily' || !calendarConnected) return

    const loadCalendarEvents = async () => {
      setCalendarLoading(true)
      setCalendarError(undefined)

      const result = await fetchCalendarEvents(selectedDate)

      if (result.error) {
        setCalendarError(result.error)
        // If auth expired, mark as disconnected
        if (result.error.includes('פג תוקף')) {
          setCalendarConnected(false)
        }
      }

      setCalendarEvents(result.events)
      setCalendarLoading(false)
    }

    void loadCalendarEvents()
  }, [viewMode, selectedDate, calendarConnected])

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
    const allProjects = await projectStore.getByBusinessId(businessId)
    const projectIds = allProjects.map(p => p.id!)
    const allTasks = await Promise.all(projectIds.map(pid => harvestTaskStore.getByProjectId(pid)))
    const businessTaskIds = new Set(allTasks.flat().map(t => t.id!))

    let entries: TimeEntry[]

    if (viewMode === 'recent') {
      // Get all entries, sort by createdAt desc, take last 50
      const all = await timeEntryStore.getAll()
      entries = all
        .filter(e => businessTaskIds.has(e.taskId))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 50)
    } else {
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

      entries = await timeEntryStore.getByDateRange(start, end)

      // Also fetch previous-day entries that cross midnight into our range
      const prevDay = adjustDate(start, -1)
      const prevDayEntries = await timeEntryStore.getByDateRange(prevDay, prevDay)
      for (const entry of prevDayEntries) {
        if (!businessTaskIds.has(entry.taskId)) continue
        // Compare as HH:MM strings — if end is before start, it crosses midnight
        if (entry.endTime < entry.startTime) {
          // Midnight-crossing: create synthetic entry for the next day (00:00 → endTime)
          const nextDay = adjustDate(entry.date, 1)
          if (nextDay >= start && nextDay <= end) {
            const [endHr, endMin] = entry.endTime.split(':').map(Number)
            entries.push({
              ...entry,
              id: undefined, // synthetic, not directly editable
              date: nextDay,
              startTime: '00:00',
              endTime: entry.endTime,
              hours: endHr + endMin / 60,
            } as TimeEntry)
          }
        }
      }
    }

    const enriched: WeekEntry[] = []
    for (const entry of entries) {
      if (!businessTaskIds.has(entry.taskId)) continue
      const task = allTasks.flat().find(t => t.id === entry.taskId)
      const project = allProjects.find(p => p.id === task?.projectId)
      enriched.push({
        ...entry,
        projectName: project?.name || '',
        taskName: task?.name || '',
        projectColor: project?.color || '#3b82f6',
      })
    }
    if (viewMode === 'recent') {
      setWeekEntries(enriched) // already sorted by createdAt
    } else {
      setWeekEntries(enriched.sort((a, b) => b.date.localeCompare(a.date)))
    }
    setWeekTotal(enriched.reduce((sum, e) => sum + e.hours, 0))
  }

  const handleStop = async () => {
    if (!activeTimer) return

    // Clear timer immediately so it can't come back via re-render or sync
    const stoppedTimer = activeTimer
    setActiveTimer(null)
    timerStore.clear()

    const hours = elapsedSeconds / 3600
    const today = formatLocalDate(new Date())

    // Calculate start and end times
    const startDate = new Date(stoppedTimer.startedAt)
    const endDate = new Date()
    const startTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
    const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`

    await timeEntryStore.add({
      taskId: stoppedTimer.taskId,
      date: today,
      startTime,
      endTime,
      hours,
    })

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
      endNextDay: false,
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
    let endMinutes = endH * 60 + endM

    // Handle entries that span midnight based on user's explicit +1 selection
    if (formData.endNextDay) {
      endMinutes += 24 * 60
    }
    const hours = (endMinutes - startMinutes) / 60

    if (hours <= 0 || hours > 25) return

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

    // Calculate if entry spans midnight from stored hours
    const startTime = entry.startTime || '09:00'
    const endTime = entry.endTime || '10:00'
    const [startH, startM] = startTime.split(':').map(Number)
    const [endH, endM] = endTime.split(':').map(Number)
    const sameDayHours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60
    // If stored hours > same-day calculation, it spans midnight
    const endNextDay = entry.hours > sameDayHours + 0.01 // small epsilon for float comparison

    setFormData({
      projectId: task.projectId,
      taskId: entry.taskId,
      date: entry.date,
      startTime,
      endTime,
      endNextDay,
    })
  }

  const handleDeleteEntry = async () => {
    if (!editingEntry) return
    await timeEntryStore.delete(editingEntry.id!)
    setEditingEntry(null)
    setFormData(null)
    await loadWeekEntries()
  }

  const handleAddTask = () => {
    if (!selectedProjectId) return

    const project = projects.find((p) => p.id === selectedProjectId)
    setEditingTask({
      projectId: selectedProjectId,
      name: '',
      hourlyRate: project?.defaultHourlyRate,
      archived: false,
      createdAt: '',
      updatedAt: '',
    })
  }

  const handleSaveNewTask = async () => {
    if (!editingTask || !editingTask.name.trim()) return

    const taskId = await harvestTaskStore.add({
      projectId: editingTask.projectId,
      name: editingTask.name.trim(),
      hourlyRate: editingTask.hourlyRate,
    })

    if (taskId) {
      // Reload tasks for this project - show all to include the new task
      const updatedTasks = await harvestTaskStore.getActiveByProjectId(editingTask.projectId)
      setAllTasks(updatedTasks)
      setTasks(updatedTasks)
      setShowAllTasks(true)
      setSelectedTaskId(taskId)
      setEditingTask(null)
    }
  }

  const handleConnectCalendar = async () => {
    const result = await requestCalendarAccess()
    if (result.success) {
      setCalendarConnected(true)
      setCalendarError(undefined)
      // Trigger reload of events
      const eventsResult = await fetchCalendarEvents(selectedDate)
      setCalendarEvents(eventsResult.events)
      if (eventsResult.error) {
        setCalendarError(eventsResult.error)
      }
    } else {
      setCalendarError(result.error)
    }
  }

  const handleDayEmptyClick = async (hour?: number) => {
    const startHour = hour ?? 9
    const startTime = `${startHour.toString().padStart(2, '0')}:00`
    const endHour = Math.min(startHour + 1, 23)
    const endTime = `${endHour.toString().padStart(2, '0')}:00`

    // Use last entry's project/task as default, falling back to selected
    let defaultProjectId = selectedProjectId
    let defaultTaskId = selectedTaskId
    if (weekEntries.length > 0) {
      const lastEntry = weekEntries[0] // sorted by date desc
      const task = await harvestTaskStore.getById(lastEntry.taskId)
      if (task) {
        defaultProjectId = task.projectId
        defaultTaskId = lastEntry.taskId
      }
    }

    setEditingEntry(null)
    setFormData({
      projectId: defaultProjectId,
      taskId: defaultTaskId,
      date: selectedDate,
      startTime,
      endTime,
      endNextDay: false,
    })
    if (defaultProjectId) {
      void harvestTaskStore.getActiveByProjectId(defaultProjectId).then(setFormTasks)
    }
  }

  const handleCalendarEventClick = (event: CalendarEvent) => {
    // Open the time entry form pre-filled with the calendar event times
    console.log('[Calendar] Event clicked:', event)
    const startTime = event.startTime && event.startTime.length > 0 ? event.startTime : '09:00'
    const endTime = event.endTime && event.endTime.length > 0 ? event.endTime : '10:00'
    console.log('[Calendar] Using times:', startTime, '-', endTime)

    setEditingEntry(null)
    setFormData({
      projectId: selectedProjectId,
      taskId: selectedTaskId,
      date: selectedDate,
      startTime,
      endTime,
      endNextDay: false,
    })
    if (selectedProjectId) {
      void harvestTaskStore.getActiveByProjectId(selectedProjectId).then(setFormTasks)
    }
  }

  const handleExportToExcel = (projectName: string, projectEntries: WeekEntry[]) => {
    if (!business) return

    const monthData = getMonthDates(monthOffset)

    // Sort entries by date ascending
    const sortedEntries = [...projectEntries].sort((a, b) => a.date.localeCompare(b.date))

    // Create worksheet data
    const wsData: any[][] = []

    // Header
    wsData.push([projectName])
    wsData.push([monthData.monthName])
    wsData.push([]) // Empty row

    // Summary header (RTL order)
    wsData.push(['סה"כ שעות', 'שעות סיום', 'שעות התחלה', 'תאריך', 'משימה'])

    // Data rows - sorted by date ascending
    let projectTotal = 0

    sortedEntries.forEach(entry => {
      // RTL order: Hours, End Time, Start Time, Date, Task
      wsData.push([
        formatHours(entry.hours),
        entry.endTime,
        entry.startTime,
        formatDisplayDate(entry.date),
        entry.taskName,
      ])
      projectTotal += entry.hours
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
            onChange={(e) => {
              const value = e.target.value
              if (value === '__show_more__') {
                setTasks(allTasks)
                setShowAllTasks(true)
              } else {
                setSelectedTaskId(Number(value))
              }
            }}
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
            {!showAllTasks && allTasks.length > RECENT_TASKS_LIMIT && (
              <option value="__show_more__" style={{ fontStyle: 'italic', color: '#6b7280' }}>
                ··· הצג עוד {allTasks.length - RECENT_TASKS_LIMIT} משימות
              </option>
            )}
          </select>

          <button
            onClick={handleAddTask}
            disabled={!selectedProjectId || !!activeTimer}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: selectedProjectId && !activeTimer ? 'pointer' : 'not-allowed',
              opacity: selectedProjectId && !activeTimer ? 1 : 0.5,
            }}
          >
            + הוסף משימה
          </button>
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
        {(['daily', 'weekly', 'monthly', 'recent'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => handleViewModeChange(mode)}
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
            {mode === 'daily' ? 'יומי' : mode === 'weekly' ? 'שבועי' : mode === 'monthly' ? 'חודשי' : 'אחרונים'}
          </button>
        ))}
      </div>

      {/* Project Summary */}
      {weekEntries.length > 0 && (
        <div style={{
          background: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1.5rem',
        }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#92400e' }}>
            סיכום לפי פרויקט
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {calculateProjectSummaries(weekEntries).map(summary => (
              <div
                key={summary.projectName}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'white',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem',
                }}
              >
                <span style={{ fontWeight: 500 }}>{summary.projectName}</span>
                <span style={{ fontWeight: 600, color: '#92400e' }}>
                  {formatHours(summary.totalHours)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily View */}
      {viewMode === 'daily' && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => setSelectedDate(adjustDate(selectedDate, -1))}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
                title="יום קודם"
              >
                →
              </button>
              <div style={{ position: 'relative' }}>
                <span
                  onClick={() => {
                    const input = document.getElementById('date-picker-input') as HTMLInputElement
                    input?.showPicker()
                  }}
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.5rem',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'inline-block',
                    background: 'white',
                  }}
                >
                  {getDayName(selectedDate)} {formatDisplayDate(selectedDate)}
                </span>
                <input
                  id="date-picker-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: 0,
                    height: 0,
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <button
                onClick={() => setSelectedDate(adjustDate(selectedDate, 1))}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
                title="יום הבא"
              >
                ←
              </button>
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
              {!calendarConnected && (
                <button
                  onClick={handleConnectCalendar}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: '#166534',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                  }}
                >
                  <span>📅</span>
                  חבר יומן
                </button>
              )}
            </div>
            <span style={{ fontWeight: 500, color: '#64748b' }}>
              {formatHours(weekTotal)} שעות
            </span>
          </div>

          {/* Two-column layout when calendar connected, single column otherwise */}
          {calendarConnected ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              {/* Calendar Events Column */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#374151' }}>
                  📅 יומן Google
                </h4>
                <CalendarColumn
                  events={calendarEvents}
                  loading={calendarLoading}
                  error={calendarError}
                  isConnected={calendarConnected}
                  onConnectClick={handleConnectCalendar}
                  onEventClick={handleCalendarEventClick}
                />
              </div>

              {/* Time Entries Column */}
              <div>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#374151' }}>
                  ⏱️ רישומי זמן
                </h4>
                {/* Hours bar visualization */}
                <HoursBar
                  entries={weekEntries}
                  onEntryClick={(entry) => {
                    const fullEntry = weekEntries.find(e => e.id === entry.id)
                    if (fullEntry) handleEditEntry(fullEntry)
                  }}
                  onEmptyClick={(hour) => void handleDayEmptyClick(hour)}
                />

                {/* Daily entries list */}
                {weekEntries.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(() => {
                      const sortedEntries = [...weekEntries].sort((a, b) => {
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
                  <div
                    onClick={() => void handleDayEmptyClick()}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '2rem',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      minHeight: '200px',
                      color: '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏱️</div>
                    <p>אין רישומי זמן ביום זה — לחץ להוספה</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Hours bar visualization */}
              <HoursBar
                entries={weekEntries}
                onEntryClick={(entry) => {
                  const fullEntry = weekEntries.find(e => e.id === entry.id)
                  if (fullEntry) handleEditEntry(fullEntry)
                }}
                onEmptyClick={(hour) => void handleDayEmptyClick(hour)}
              />

              {/* Daily entries list */}
              {weekEntries.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(() => {
                    const sortedEntries = [...weekEntries].sort((a, b) => {
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
                <p
                  onClick={() => void handleDayEmptyClick()}
                  style={{ color: '#64748b', textAlign: 'center', cursor: 'pointer' }}
                >
                  אין רישומי זמן ביום זה — לחץ להוספה
                </p>
              )}
            </>
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
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{DAY_NAMES_HE[i]}</div>
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
                const projectGroups = new Map<string, { projectName: string; entries: WeekEntry[] }>()

                weekEntries.forEach(entry => {
                  if (!projectGroups.has(entry.projectName)) {
                    projectGroups.set(entry.projectName, {
                      projectName: entry.projectName,
                      entries: [],
                    })
                  }
                  projectGroups.get(entry.projectName)!.entries.push(entry)
                })

                const calendarDays = getCalendarDays(monthOffset)

                return Array.from(projectGroups.values()).map(project => {
                  const projectTotal = project.entries.reduce((sum, e) => sum + e.hours, 0)

                  // Group entries by date
                  const entriesByDate = new Map<string, { hours: number; tasks: string[] }>()
                  project.entries.forEach(entry => {
                    if (!entriesByDate.has(entry.date)) {
                      entriesByDate.set(entry.date, { hours: 0, tasks: [] })
                    }
                    const dayData = entriesByDate.get(entry.date)!
                    dayData.hours += entry.hours
                    if (!dayData.tasks.includes(entry.taskName)) {
                      dayData.tasks.push(entry.taskName)
                    }
                  })

                  // Check if this project has entries for Friday (5) or Saturday (6)
                  const hasSaturdayEntries = project.entries.some(entry => new Date(entry.date).getDay() === 6)
                  const hasFridayEntries = project.entries.some(entry => new Date(entry.date).getDay() === 5)

                  // Saturday entries → show both Fri+Sat, Friday only → show Fri, neither → Sun-Thu only
                  let visibleDays: string[]
                  let numColumns: number
                  let excludeDays: number[]

                  if (hasSaturdayEntries) {
                    visibleDays = DAY_NAMES_HE
                    numColumns = 7
                    excludeDays = []
                  } else if (hasFridayEntries) {
                    visibleDays = DAY_NAMES_HE.slice(0, 6)
                    numColumns = 6
                    excludeDays = [6] // exclude Saturday
                  } else {
                    visibleDays = DAY_NAMES_HE.slice(0, 5)
                    numColumns = 5
                    excludeDays = [5, 6] // exclude Friday and Saturday
                  }

                  // Filter calendar days based on this project's weekend entries
                  const filteredDays = calendarDays.filter(({ date }) => {
                    const dayOfWeek = new Date(date).getDay()
                    return !excludeDays.includes(dayOfWeek)
                  })

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
                            onClick={() => handleExportToExcel(project.projectName, project.entries)}
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
                      {/* Calendar Grid */}
                      <div style={{ padding: '0.5rem', direction: 'rtl' }}>
                        {/* Day headers */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`,
                          gap: '2px',
                        }}>
                          {visibleDays.map(day => (
                            <div
                              key={day}
                              style={{
                                textAlign: 'center',
                                padding: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#64748b',
                                border: '1px solid transparent',
                              }}
                            >
                              {day}
                            </div>
                          ))}
                        </div>
                        {/* Calendar days - 5 rows */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`,
                          gap: '2px',
                        }}>
                          {filteredDays.map(({ date, isCurrentMonth }) => {
                            const dayData = entriesByDate.get(date)
                            const dayNum = parseInt(date.split('-')[2])
                            return (
                              <div
                                key={date}
                                onClick={() => {
                                  setSelectedDate(date)
                                  setViewMode('daily')
                                }}
                                style={{
                                  background: isCurrentMonth ? 'white' : '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '0.25rem',
                                  padding: '0.25rem',
                                  minHeight: '60px',
                                  opacity: isCurrentMonth ? 1 : 0.5,
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{
                                  fontSize: '0.7rem',
                                  color: '#94a3b8',
                                  marginBottom: '0.125rem',
                                }}>
                                  {dayNum}
                                </div>
                                {dayData && (
                                  <>
                                    <div style={{
                                      fontSize: '0.8rem',
                                      fontWeight: 600,
                                      color: '#0369a1',
                                    }}>
                                      {formatHours(dayData.hours)}
                                    </div>
                                    <div style={{
                                      fontSize: '0.65rem',
                                      color: '#64748b',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {dayData.tasks.join(', ')}
                                    </div>
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
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

      {/* Recent View */}
      {viewMode === 'recent' && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>רישומים אחרונים</h3>
            <span style={{ fontWeight: 500, color: '#64748b' }}>
              {formatHours(weekTotal)} שעות
            </span>
          </div>

          {weekEntries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {weekEntries.map((entry) => (
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
                      {formatDisplayDate(entry.date)}
                      {entry.startTime && entry.endTime ? ` · ${entry.startTime} - ${entry.endTime}` : ''}
                      {' · '}{formatHours(entry.hours)} שעות
                    </div>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{formatHours(entry.hours)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', textAlign: 'center' }}>
              אין רישומי זמן
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

      {/* Add Task Modal */}
      {editingTask && (
        <FormModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveNewTask}
          title="משימה חדשה"
        >
          <FormField label="שם">
            <input
              type="text"
              value={editingTask.name}
              onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })}
              placeholder="לדוגמה: פיתוח, עיצוב, ניהול"
              autoFocus
              style={inputStyle}
            />
          </FormField>

          <FormField label="תעריף שעתי (אופציונלי)">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                value={editingTask.hourlyRate || ''}
                onChange={(e) => setEditingTask({ ...editingTask, hourlyRate: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="0"
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>₪ / שעה</span>
            </div>
          </FormField>
        </FormModal>
      )}
    </div>
  )
}
