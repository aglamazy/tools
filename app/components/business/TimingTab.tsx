'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { projectStore } from '@/app/stores/projectStore'
import { harvestTaskStore } from '@/app/stores/harvestTaskStore'
import { timeEntryStore } from '@/app/stores/timeEntryStore'
import { timerStore, type ActiveTimer } from '@/app/stores/timerStore'
import { businessStore } from '@/app/stores/businessStore'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import type { Project, HarvestTask, Business, TimeEntry } from '@/app/db/financeDB'
import TimeEntryForm, { type TimeEntryFormData } from './TimeEntryForm'
import FormModal, { FormField, inputStyle } from '../FormModal'
import Modal from '@/app/components/Modal'
import DailyView from './DailyView'
import WeeklyView from './WeeklyView'
import MonthlyCalendarView from './MonthlyCalendarView'
import RecentView from './RecentView'
import TimerSection from './TimerSection'
import InvoicePreviewModal, { type InvoicePreview } from './InvoicePreviewModal'
import { exportToExcel } from './excelExport'
import { type WeekEntry, type ViewMode, VIEW_MODES, calculateProjectSummaries } from './timingTypes'
import {
  hasCalendarAccess,
  requestCalendarAccess,
  fetchCalendarEvents,
  type CalendarEvent,
} from '@/app/services/googleCalendarService'
import {
  formatLocalDate,
  formatHours,
  adjustDate,
  getWeekDates,
  getMonthDates,
} from '@/app/lib/dateUtils'

type TimingTabProps = {
  businessId: number
}

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
  const [hasYpay, setHasYpay] = useState(false)
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreview | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)

  useEffect(() => {
    appSettingsStore.getYpayCredentials().then(creds => setHasYpay(!!creds))
  }, [])

  function getLastWorkingDay(offset: number): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + offset
    const lastDay = new Date(year, month + 1, 0)
    while (lastDay.getDay() === 5 || lastDay.getDay() === 6) {
      lastDay.setDate(lastDay.getDate() - 1)
    }
    return lastDay.toISOString().split('T')[0]
  }

  const handleCreateInvoice = (projectName: string, totalHours: number) => {
    const project = projects.find(p => p.name === projectName)
    if (!project?.defaultHourlyRate) {
      setInvoiceError('לא הוגדר תעריף שעתי לפרויקט')
      return
    }
    if (!project.contactEmail) {
      setInvoiceError('לא הוגדר אימייל איש קשר לפרויקט')
      return
    }

    const { monthName } = getMonthDates(monthOffset)
    const amount = totalHours * project.defaultHourlyRate
    const date = getLastWorkingDay(monthOffset)

    setInvoicePreview({
      projectName,
      totalHours,
      hourlyRate: project.defaultHourlyRate,
      amount,
      monthName,
      date,
      contactEmail: project.contactEmail,
      contactBusinessID: project.contactBusinessID,
      contactPhone: project.contactPhone,
      description: `${projectName} - ${monthName} (${totalHours.toFixed(2)} שעות × ${project.defaultHourlyRate} ₪)`,
    })
  }

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
    exportToExcel(projectName, projectEntries, monthOffset)
  }

  return (
    <div>
      <TimerSection
        projects={projects}
        tasks={tasks}
        allTasks={allTasks}
        selectedProjectId={selectedProjectId}
        selectedTaskId={selectedTaskId}
        activeTimer={activeTimer}
        elapsedSeconds={elapsedSeconds}
        showAllTasks={showAllTasks}
        recentTasksLimit={RECENT_TASKS_LIMIT}
        onProjectChange={setSelectedProjectId}
        onTaskChange={(value) => setSelectedTaskId(Number(value))}
        onShowAllTasks={() => { setTasks(allTasks); setShowAllTasks(true) }}
        onAddTask={handleAddTask}
        onStart={handleStart}
        onStop={handleStop}
        onManualEntry={handleOpenManualEntry}
      />

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

      {viewMode === 'daily' && (
        <DailyView
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          weekEntries={weekEntries}
          weekTotal={weekTotal}
          calendarConnected={calendarConnected}
          calendarEvents={calendarEvents}
          calendarLoading={calendarLoading}
          calendarError={calendarError}
          onConnectCalendar={handleConnectCalendar}
          onCalendarEventClick={handleCalendarEventClick}
          onEditEntry={handleEditEntry}
          onStartFromEntry={handleStartFromEntry}
          onEmptyClick={(hour) => void handleDayEmptyClick(hour)}
        />
      )}

      {viewMode === 'weekly' && (
        <WeeklyView
          weekOffset={weekOffset}
          onWeekOffsetChange={setWeekOffset}
          weekEntries={weekEntries}
          weekTotal={weekTotal}
          onEditEntry={handleEditEntry}
          onStartFromEntry={handleStartFromEntry}
        />
      )}

      {viewMode === 'monthly' && (
        <MonthlyCalendarView
          monthOffset={monthOffset}
          onMonthOffsetChange={setMonthOffset}
          weekEntries={weekEntries}
          weekTotal={weekTotal}
          hasYpay={hasYpay}
          onExportToExcel={handleExportToExcel}
          onCreateInvoice={handleCreateInvoice}
          onDayClick={(date) => { setSelectedDate(date); setViewMode('daily') }}
        />
      )}

      {viewMode === 'recent' && (
        <RecentView
          weekEntries={weekEntries}
          weekTotal={weekTotal}
          onEditEntry={handleEditEntry}
        />
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
      {invoicePreview && (
        <InvoicePreviewModal
          preview={invoicePreview}
          onClose={() => setInvoicePreview(null)}
          onError={setInvoiceError}
        />
      )}

      {/* Invoice Error Modal */}
      <Modal isOpen={!!invoiceError} onClose={() => setInvoiceError(null)} maxWidth="400px">
        <div style={{ textAlign: 'center', padding: '1.5rem', direction: 'rtl' }}>
          <p style={{ fontSize: '1.05rem', margin: '0 0 1.25rem' }}>{invoiceError}</p>
          <button
            onClick={() => setInvoiceError(null)}
            className="file-picker"
          >
            <span>אישור</span>
          </button>
        </div>
      </Modal>
    </div>
  )
}
