'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { projectStore } from '@/app/stores/projectStore'
import { harvestTaskStore } from '@/app/stores/harvestTaskStore'
import { timeEntryStore } from '@/app/stores/timeEntryStore'
import { timerStore, type ActiveTimer } from '@/app/stores/timerStore'
import { businessStore } from '@/app/stores/businessStore'
import { db, type Project, type HarvestTask, type Business, type TimeEntry } from '@/app/db/financeDB'
import TimeEntryForm, { type TimeEntryFormData } from './TimeEntryForm'
import AddTaskModal, { type EditingTask } from './AddTaskModal'
import Modal from '@/app/components/Modal'
import DailyView from './DailyView'
import WeeklyView from './WeeklyView'
import MonthlyCalendarView from './MonthlyCalendarView'
import RecentView from './RecentView'
import TimerSection from './TimerSection'
import MultiMonthInvoiceModal from './MultiMonthInvoiceModal'
import ProjectSummary from './ProjectSummary'
import ViewModeSelector from './ViewModeSelector'
import { exportToExcel, generateExcelBase64 } from './excelExport'
import { hasGmailAccess, requestGmailAccess, sendEmail, type EmailAttachment } from '@/app/services/gmailService'
import { ypayService } from '@/app/services/ypayService'
import { getTaxProfile } from '@/app/components/TaxProfileSection'
import { type WeekEntry, type ViewMode, VIEW_MODES } from './timingTypes'
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
  const [editingTask, setEditingTask] = useState<EditingTask | null>(null)
  const [multiInvoiceProject, setMultiInvoiceProject] = useState<Project | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [createdInvoices, setCreatedInvoices] = useState<Record<string, string>>({})
  const [profileVatType, setProfileVatType] = useState<'exempt' | 'authorized' | undefined>(undefined)
  const hasYpay = business?.ypayUseSandbox
    ? !!(business?.ypaySandboxClientId && business?.ypaySandboxClientSecret)
    : !!(business?.ypayClientId && business?.ypayClientSecret)

  // Load existing invoices for the selected month
  useEffect(() => {
    const { monthName } = getMonthDates(monthOffset)
    db.ypayDocuments
      .filter(doc => doc.transactionId.startsWith('invoice:') && doc.transactionId.endsWith(`:${monthName}`))
      .toArray()
      .then(docs => {
        const map: Record<string, string> = {}
        for (const doc of docs) {
          const projectName = doc.transactionId.replace('invoice:', '').replace(`:${monthName}`, '')
          map[projectName] = doc.serialNumber
        }
        setCreatedInvoices(map)
      })
  }, [monthOffset])

  // Open the multi-month invoice builder for a project (choose which months to bill).
  const handleCreateInvoice = (projectName: string) => {
    const project = projects.find(p => p.name === projectName)
    if (!project) {
      setInvoiceError('פרויקט לא נמצא')
      return
    }
    setMultiInvoiceProject(project)
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
      const profile = await getTaxProfile(b?.userId)
      setProfileVatType(profile.vatType)
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

    // If timer ran more than 12h, it was likely left running by mistake — open form for review
    if (hours > 12) {
      const task = await harvestTaskStore.getById(stoppedTimer.taskId)
      if (task) {
        const projectTasks = await harvestTaskStore.getActiveByProjectId(task.projectId)
        setFormTasks(projectTasks)
      }
      setEditingEntry(null)
      setFormData({
        projectId: task?.projectId ?? null,
        taskId: stoppedTimer.taskId,
        date: today,
        startTime,
        endTime,
        endNextDay: endTime < startTime,
      })
      await loadWeekEntries()
      return
    }

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
    // Default to a date within the viewed period, not always today
    let defaultDate = today
    if (viewMode === 'daily') {
      defaultDate = selectedDate
    } else if (viewMode === 'weekly') {
      const { start, end } = getWeekDates(weekOffset)
      defaultDate = today >= start && today <= end ? today : start
    } else if (viewMode === 'monthly') {
      const { start, end } = getMonthDates(monthOffset)
      defaultDate = today >= start && today <= end ? today : start
    }
    setEditingEntry(null)
    setFormData({
      projectId: selectedProjectId,
      taskId: selectedTaskId,
      date: defaultDate,
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

    const startTime = entry.startTime || '09:00'
    const endTime = entry.endTime || '10:00'
    // Entry crosses midnight only when endTime string is earlier than startTime string (HH:MM comparison)
    const endNextDay = endTime < startTime

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
    const startTime = event.startTime && event.startTime.length > 0 ? event.startTime : '09:00'
    const endTime = event.endTime && event.endTime.length > 0 ? event.endTime : '10:00'

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

  const handleEmailReport = async (projectName: string, projectEntries: WeekEntry[]) => {
    if (!business) return
    const project = projects.find(p => p.name === projectName)
    if (!project?.contactEmail) {
      setInvoiceError('לא הוגדר אימייל איש קשר לפרויקט')
      return
    }

    // Ensure Gmail access
    if (!hasGmailAccess()) {
      const result = await requestGmailAccess()
      if (!result.success) {
        setInvoiceError(result.error || 'לא ניתן להתחבר ל-Gmail')
        return
      }
    }

    const { monthName } = getMonthDates(monthOffset)
    const attachments: EmailAttachment[] = []

    // Generate Excel attachment
    const { base64: excelBase64, fileName: excelFileName } = generateExcelBase64(projectName, projectEntries, monthOffset)
    attachments.push({
      filename: excelFileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: excelBase64,
    })

    // Check for invoice document and try to download PDF
    const invoiceDoc = await db.ypayDocuments
      .filter(d => d.transactionId === `invoice:${projectName}:${monthName}`)
      .first()

    let invoicePdfAttached = false
    if (invoiceDoc?.url) {
      const pdfResult = await ypayService.downloadPdf(invoiceDoc.url)
      if (pdfResult.success && pdfResult.base64) {
        attachments.push({
          filename: `חשבונית_${invoiceDoc.serialNumber}_${projectName}.pdf`,
          mimeType: 'application/pdf',
          base64: pdfResult.base64,
        })
        invoicePdfAttached = true
      }
    }

    const totalHours = projectEntries.reduce((sum, e) => sum + e.hours, 0)
    const businessName = business?.name || ''
    const subject = `${businessName} — דוח שעות ${projectName} — ${monthName}`
    const invoiceUrl = invoiceDoc?.url?.replace('/document/view/', '/document/pdf/')
    // Label per the actual doc that was issued (104 = חשבונית עסקה, 106 = חשבונית מס).
    // Falls back to the current profile status when docType is missing.
    const invoiceDocLabel = invoiceDoc?.docType === 106
      ? 'חשבונית מס'
      : invoiceDoc?.docType === 104
        ? 'חשבונית עסקה'
        : (profileVatType === 'authorized' ? 'חשבונית מס' : 'חשבונית עסקה')
    const html = `
      <div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 1.5rem 2rem; border-radius: 0.75rem 0.75rem 0 0;">
          <h1 style="margin: 0; color: white; font-size: 1.25rem; font-weight: 600;">${businessName}</h1>
          <p style="margin: 0.25rem 0 0; color: #bfdbfe; font-size: 0.9rem;">דוח שעות — ${monthName}</p>
        </div>
        <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 0.75rem 0.75rem; padding: 1.5rem 2rem; background: #ffffff;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem;">
            <tr>
              <td style="padding: 0.5rem 0; color: #64748b; font-size: 0.9rem;">פרויקט</td>
              <td style="padding: 0.5rem 0; font-weight: 600; font-size: 0.95rem;">${projectName}</td>
            </tr>
            <tr>
              <td style="padding: 0.5rem 0; color: #64748b; font-size: 0.9rem;">סה״כ שעות</td>
              <td style="padding: 0.5rem 0; font-weight: 700; font-size: 1.1rem; color: #1e40af;">${totalHours.toFixed(2)}</td>
            </tr>
            ${invoiceDoc ? `
            <tr>
              <td style="padding: 0.5rem 0; color: #64748b; font-size: 0.9rem;">${invoiceDocLabel}</td>
              <td style="padding: 0.5rem 0; font-weight: 600;">#${invoiceDoc.serialNumber}${invoicePdfAttached ? ' (מצורפת)' : ` — <a href="${invoiceUrl}" style="color: #2563eb;">צפה בחשבונית</a>`}</td>
            </tr>` : ''}
          </table>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 1rem 0;" />
          <p style="color: #475569; font-size: 0.9rem; margin: 0;">מצורפים: דוח שעות מפורט${invoicePdfAttached ? ` + ${invoiceDocLabel}` : ''}.</p>
        </div>
        <div style="text-align: center; padding: 1rem 0 0.5rem;">
          <a href="https://aglamazo.com" style="color: #94a3b8; text-decoration: none; font-size: 0.8rem;">
            <strong style="color: #64748b;">Aglamazo</strong> — הראש השקט של העסק שלך
          </a>
        </div>
      </div>
    `

    // TODO: remove hardcoded email after testing
    const result = await sendEmail('yaakov.aglamaz@gmail.com', subject, html, attachments)
    if (result.success) {
      setInvoiceError(`המייל נשלח בהצלחה ל-yaakov.aglamaz@gmail.com`)
    } else {
      setInvoiceError(result.error || 'שגיאה בשליחת מייל')
    }
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

      <ViewModeSelector viewMode={viewMode} onViewModeChange={handleViewModeChange} />
      <ProjectSummary weekEntries={weekEntries} />

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
          vatType={profileVatType}
          onExportToExcel={handleExportToExcel}
          onCreateInvoice={handleCreateInvoice}
          onEmailReport={handleEmailReport}
          createdInvoices={createdInvoices}
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

      <AddTaskModal
        editingTask={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveNewTask}
        onChange={setEditingTask}
      />
      {multiInvoiceProject && (
        <MultiMonthInvoiceModal
          business={business!}
          project={multiInvoiceProject}
          vatType={profileVatType}
          onClose={() => setMultiInvoiceProject(null)}
          onCreated={(serialNumber) => {
            setCreatedInvoices(prev => ({ ...prev, [multiInvoiceProject.name]: serialNumber }))
          }}
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
