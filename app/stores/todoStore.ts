import { db, Task, EisenhowerQuadrant, type BusinessTask, type TaskType, type LeadTaskExt } from '@/app/db/financeDB'
import { transactionStore } from './transactionStore'
import { getUser } from './authStore'
import { appSettingsStore, AccountOwners } from './appSettingsStore'
import { routes } from '@/app/config'
import type { AgentTaskStatus } from '@/app/types/bot'
import { getTaxProfile } from '@/app/components/TaxProfileSection'
import { MONTH_NAMES_HE } from '@/app/lib/dateUtils'

type Priority = 'low' | 'medium' | 'high'

export type { EisenhowerQuadrant }

export type UserTask = {
  id: number
  title: string
  completed: boolean
  priority: Priority
  quadrant: EisenhowerQuadrant
  deadline?: string
  snoozedUntil?: string
  delegatedTo?: string
  delegatedBy?: string
  botId?: string
  agentTaskId?: string
  agentStatus?: AgentTaskStatus
  agentResult?: string
  taskType?: TaskType
  subject?: string
  tags?: string[]
  ext?: Task['ext']
  createdAt: string
}

export type AutoTask = {
  id: string
  title: string
  description: string
  type: 'missing-file' | 'uncategorized' | 'expected-payment' | 'recurring' | 'other'
  priority: Priority
  quadrant: EisenhowerQuadrant
  deadline: string
  link: string
  createdAt: string
  month: string // Format: MM/YYYY - the month this task references
}

/**
 * Determine Eisenhower quadrant for an auto-task based on its deadline.
 * - Before deadline → Q2 (תכנן: important, plan ahead)
 * - On or past deadline → Q1 (עשה עכשיו: time to act)
 */
function computeAutoTaskQuadrant(deadline: Date): EisenhowerQuadrant {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const dl = new Date(deadline)
  dl.setHours(0, 0, 0, 0)

  if (now >= dl) return 'do'
  return 'schedule'
}

/**
 * Get the default deadline for auto-tasks: 10th of the relevant month.
 */
function getAutoTaskDeadline(month: string): Date {
  const [mm, yyyy] = month.split('/').map(Number)
  return new Date(yyyy, mm - 1, 10)
}

export const todoStore = {
  async addTask(
    title: string,
    priority: Priority,
    quadrant: EisenhowerQuadrant = 'do',
    deadline?: string
  ): Promise<UserTask> {
    const task: Omit<Task, 'id'> = {
      title,
      completed: false,
      priority,
      quadrant,
      ...(deadline ? { deadline } : {}),
      createdAt: new Date().toISOString(),
    }
    const id = await db.tasks.add(task)
    return { ...task, id }
  },

  async findByAgentTaskId(agentTaskId: string): Promise<Task | undefined> {
    return db.tasks.filter(t => t.agentTaskId === agentTaskId).first()
  },

  /** Remove duplicate tasks (same title + quadrant + not completed). Keeps the oldest. */
  async deduplicateTasks(): Promise<number> {
    const tasks = await db.tasks.filter(t => !t.autoTaskId && !t.completed).toArray()
    const seen = new Map<string, number>() // key -> oldest task id
    const toDelete: number[] = []

    // Sort by createdAt ascending so we keep the oldest
    tasks.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))

    for (const task of tasks) {
      const key = `${task.title}||${task.quadrant}`
      if (seen.has(key)) {
        toDelete.push(task.id!)
      } else {
        seen.set(key, task.id!)
      }
    }

    // Also dedup by agentTaskId (cross-instance sync duplicates)
    const allTasks = await db.tasks.filter(t => !!t.agentTaskId).toArray()
    const agentSeen = new Map<string, Task[]>()
    for (const task of allTasks) {
      const existing = agentSeen.get(task.agentTaskId!)
      if (existing) {
        existing.push(task)
      } else {
        agentSeen.set(task.agentTaskId!, [task])
      }
    }
    for (const [, dupes] of agentSeen) {
      if (dupes.length <= 1) continue
      // Keep the one with latest updatedAt
      dupes.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      for (let i = 1; i < dupes.length; i++) {
        toDelete.push(dupes[i].id!)
      }
    }

    if (toDelete.length > 0) {
      await db.tasks.bulkDelete(toDelete)
      console.log(`[TodoStore] Removed ${toDelete.length} duplicate tasks`)
    }
    return toDelete.length
  },

  async getAllTasks(): Promise<UserTask[]> {
    const tasks = await db.tasks.filter(t => !t.autoTaskId).toArray()
    return tasks.map(t => ({
      id: t.id!,
      title: t.title,
      completed: t.completed,
      priority: t.priority,
      quadrant: t.quadrant || 'do',
      deadline: t.deadline,
      snoozedUntil: t.snoozedUntil,
      delegatedTo: t.delegatedTo,
      delegatedBy: t.delegatedBy,
      botId: t.botId,
      agentTaskId: t.agentTaskId,
      agentStatus: t.agentStatus,
      agentResult: t.agentResult,
      taskType: t.taskType,
      subject: t.subject,
      tags: t.tags,
      ext: t.ext,
      createdAt: t.createdAt,
    }))
  },

  async toggleTask(id: number): Promise<void> {
    const task = await db.tasks.get(id)
    if (task) {
      await db.tasks.update(id, { completed: !task.completed })
    }
  },

  async deleteTask(id: number): Promise<void> {
    await db.tasks.delete(id)
  },

  async updateTask(id: number, updates: Partial<Omit<Task, 'id'>>): Promise<void> {
    await db.tasks.update(id, updates)
  },

  async moveTask(id: number, quadrant: EisenhowerQuadrant): Promise<void> {
    await db.tasks.update(id, { quadrant })
  },

  async updateTaskPriority(id: number, priority: Priority): Promise<void> {
    await db.tasks.update(id, { priority })
  },

  async snoozeTask(id: number, until: string): Promise<void> {
    await db.tasks.update(id, { snoozedUntil: until })
  },

  async unsnoozeTask(id: number): Promise<void> {
    await db.tasks.update(id, { snoozedUntil: undefined })
  },

  async snoozeAutoTask(autoTaskId: string, until: string): Promise<void> {
    // Upsert a Task record with autoTaskId
    const existing = await db.tasks.where('autoTaskId').equals(autoTaskId).first()
    if (existing) {
      await db.tasks.update(existing.id!, { snoozedUntil: until })
    } else {
      await db.tasks.add({
        title: `[auto] ${autoTaskId}`,
        completed: false,
        priority: 'low',
        quadrant: 'schedule',
        autoTaskId,
        snoozedUntil: until,
        createdAt: new Date().toISOString(),
      })
    }
  },

  async unsnoozeAutoTask(autoTaskId: string): Promise<void> {
    const existing = await db.tasks.where('autoTaskId').equals(autoTaskId).first()
    if (existing) {
      await db.tasks.update(existing.id!, { snoozedUntil: undefined })
    }
  },

  /** Mark a recurring/completable auto-task as done (snoozed until its deadline + 1 day so it hides until next cycle) */
  async completeAutoTask(autoTaskId: string, deadline?: string): Promise<void> {
    // Hide until after the deadline — the next recurrence will generate a new auto-task
    let hideUntil: Date
    if (deadline) {
      hideUntil = new Date(deadline)
      hideUntil.setDate(hideUntil.getDate() + 1)
    } else {
      hideUntil = new Date()
      hideUntil.setDate(hideUntil.getDate() + 30)
    }
    hideUntil.setHours(0, 0, 0, 0)

    const existing = await db.tasks.where('autoTaskId').equals(autoTaskId).first()
    if (existing) {
      await db.tasks.update(existing.id!, { completed: true, snoozedUntil: hideUntil.toISOString() })
    } else {
      await db.tasks.add({
        title: `[auto] ${autoTaskId}`,
        completed: true,
        priority: 'low',
        quadrant: 'schedule',
        autoTaskId,
        snoozedUntil: hideUntil.toISOString(),
        createdAt: new Date().toISOString(),
      })
    }
  },

  async delegateTask(id: number, toUid: string): Promise<void> {
    const currentUid = getUser()?.uid
    await db.tasks.update(id, {
      delegatedTo: toUid,
      delegatedBy: currentUid,
      quadrant: 'delegate' as EisenhowerQuadrant,
    })
  },

  async undelegateTask(id: number): Promise<void> {
    const task = await db.tasks.get(id)
    if (task) {
      await db.tasks.update(id, {
        delegatedTo: undefined,
        delegatedBy: undefined,
        quadrant: 'do' as EisenhowerQuadrant,
      })
    }
  },

  async delegateToBot(id: number, botId: string, agentTaskId: string): Promise<void> {
    await db.tasks.update(id, {
      botId,
      agentTaskId,
      agentStatus: 'pending' as AgentTaskStatus,
      quadrant: 'delegate' as EisenhowerQuadrant,
    })
  },

  async updateAgentStatus(id: number, status: AgentTaskStatus, result?: string): Promise<void> {
    const updates: Partial<Task> = { agentStatus: status }
    if (result !== undefined) updates.agentResult = result
    if (status === 'done') updates.completed = true
    await db.tasks.update(id, updates)
  },

  async importLeads(
    leads: { name: string; deadline?: string; links?: { text: string; url: string }[]; address?: string; tags?: string[]; status?: string; notes?: string; phone?: string; priority?: 'low' | 'medium' | 'high' }[],
    quadrant: EisenhowerQuadrant = 'schedule',
    subject?: string,
    taskTags?: string[],
  ): Promise<number> {
    const now = new Date().toISOString()
    const tasks: Omit<Task, 'id'>[] = leads.map(lead => ({
      title: lead.name,
      completed: false,
      priority: lead.priority || 'medium' as const,
      quadrant,
      taskType: 'lead' as const,
      subject,
      tags: taskTags,
      ext: {
        kind: 'lead' as const,
        links: lead.links || [],
        address: lead.address,
        leadTags: lead.tags,
        applicationStatus: lead.status === 'sent' ? 'sent' as const : 'new' as const,
        phone: lead.phone,
        notes: lead.deadline ? `Deadline: ${lead.deadline}${lead.notes ? '; ' + lead.notes : ''}` : lead.notes,
      } satisfies LeadTaskExt,
      createdAt: now,
    }))
    await db.tasks.bulkAdd(tasks)
    return tasks.length
  },

  async importTaskList(
    lines: string[],
    quadrant: EisenhowerQuadrant = 'do',
    subject?: string,
    taskTags?: string[],
  ): Promise<number> {
    const now = new Date().toISOString()
    const tasks: Omit<Task, 'id'>[] = lines
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(title => ({
        title,
        completed: false,
        priority: 'medium' as const,
        quadrant,
        taskType: 'personal' as const,
        subject,
        tags: taskTags,
        createdAt: now,
      }))
    await db.tasks.bulkAdd(tasks)
    return tasks.length
  },

  async getAutoTasks(): Promise<AutoTask[]> {
    const autoTasks: AutoTask[] = []

    // Get the latest month with transactions (most recent data)
    const availableMonths = await transactionStore.getAvailableMonths()

    if (availableMonths.length === 0) {
      return autoTasks // No data yet
    }

    const latestMonth = availableMonths[0] // Already sorted newest first
    const month2 = getPreviousMonth(latestMonth)
    const month3 = getPreviousMonth(month2)
    const defaultPeriod = [latestMonth, month2, month3]

    // Load account ownership for household filtering
    const currentUid = getUser()?.uid
    const owners = await appSettingsStore.getAccountOwners()

    // Check for missing files (bank and credit cards) for ALL months since first import
    const missingFileTasks = await checkMissingFiles(owners, currentUid)
    autoTasks.push(...missingFileTasks)

    // Check for uncategorized transactions in default 3-month period
    for (const month of defaultPeriod) {
      const uncategorizedTasks = await checkUncategorizedTransactions(month, owners, currentUid)
      autoTasks.push(...uncategorizedTasks)
    }

    // Check recurring business tasks
    const recurringTasks = await checkRecurringBusinessTasks()
    autoTasks.push(...recurringTasks)

    // Check upcoming/overdue BTL advance payments (person-level, for logged-in user)
    const btlTasks = await checkBtlPaymentReminders()
    autoTasks.push(...btlTasks)

    // Filter out auto-tasks that are currently snoozed (via Task records with autoTaskId)
    const now = new Date().toISOString()
    const autoTaskRecords = await db.tasks.where('autoTaskId').above('').toArray()
    const snoozedIds = new Set(
      autoTaskRecords
        .filter(t => t.snoozedUntil && t.snoozedUntil > now)
        .map(t => t.autoTaskId!)
    )

    return autoTasks.filter(t => !snoozedIds.has(t.id))
  },
}

// Helper functions

function getPreviousMonth(monthYear: string): string {
  const [month, year] = monthYear.split('/').map(Number)
  if (month === 1) {
    return `12/${year - 1}`
  }
  return `${String(month - 1).padStart(2, '0')}/${year}`
}

function getAllMonthsInRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = []
  let current = startMonth

  while (current !== endMonth) {
    months.push(current)
    current = getNextMonth(current)
  }
  months.push(endMonth) // Include the end month

  return months
}

function getNextMonth(monthYear: string): string {
  const [month, year] = monthYear.split('/').map(Number)
  if (month === 12) {
    return `01/${year + 1}`
  }
  return `${String(month + 1).padStart(2, '0')}/${year}`
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

function compareMonths(month1: string, month2: string): number {
  const [m1, y1] = month1.split('/').map(Number)
  const [m2, y2] = month2.split('/').map(Number)

  if (y1 !== y2) return y1 - y2
  return m1 - m2
}

function isAccountVisibleToUser(accountKey: string, owners: AccountOwners, currentUid: string | undefined): boolean {
  if (!currentUid) return true // No user logged in, show all
  const owner = owners[accountKey]
  if (!owner) return true // Unassigned, show to everyone
  return owner === currentUid // Show only if assigned to current user
}

async function checkMissingFiles(owners: AccountOwners, currentUid: string | undefined): Promise<AutoTask[]> {
  const tasks: AutoTask[] = []
  const data = await transactionStore.getImportedFiles()
  const importedFiles = data?.files || []

  console.log('[TodoStore] checkMissingFiles - Total imported files:', importedFiles.length)

  // Determine the range of months to check
  let monthsToCheck: string[]

  if (importedFiles.length === 0) {
    // No data - check last 3 months from today
    const currentMonth = getCurrentMonth()
    const month2 = getPreviousMonth(currentMonth)
    const month3 = getPreviousMonth(month2)
    monthsToCheck = [month3, month2, currentMonth]
    console.log('[TodoStore] No imported files - checking last 3 months:', monthsToCheck)
  } else {
    // Find earliest month from imported files
    const allMonths = importedFiles
      .map(f => f.processingMonth)
      .filter((m): m is string => !!m)

    console.log('[TodoStore] All unique months from imports:', allMonths)

    if (allMonths.length === 0) {
      console.log('[TodoStore] No valid months found in imported files')
      return tasks // No valid months
    }

    allMonths.sort(compareMonths)
    const earliestMonth = allMonths[0]
    const currentMonth = getCurrentMonth()

    console.log('[TodoStore] Month range:', earliestMonth, 'to', currentMonth, '(current)')

    // Generate all months from earliest to current month
    monthsToCheck = getAllMonthsInRange(earliestMonth, currentMonth)
    console.log('[TodoStore] Checking months:', monthsToCheck)
  }

  // Get unique bank accounts and credit cards from all imported files
  const bankAccounts = new Set<string>()
  const creditCards = new Set<string>()

  importedFiles.forEach(file => {
    if (file.fileType === 'bank' && file.accountNumber) {
      bankAccounts.add(file.accountNumber)
    } else if (file.fileType === 'credit-card' && file.cardNumber) {
      creditCards.add(file.cardNumber)
    }
  })

  // If no accounts/cards exist yet, suggest checking imports for recent months
  if (bankAccounts.size === 0 && creditCards.size === 0) {
    const currentMonth = getCurrentMonth()
    const deadline = getAutoTaskDeadline(currentMonth)
    tasks.push({
      id: `missing-initial-${currentMonth}`,
      title: `[${currentMonth}] לא נמצאו קבצים מיובאים`,
      description: 'יש להתחיל לייבא קבצי בנק וכרטיסי אשראי',
      type: 'missing-file',
      priority: 'low',
      quadrant: computeAutoTaskQuadrant(deadline),
      deadline: deadline.toISOString(),
      link: routes.import,
      createdAt: new Date().toISOString(),
      month: currentMonth,
    })
    return tasks
  }

  const latestMonthInRange = monthsToCheck[monthsToCheck.length - 1]

  // Check for missing bank files for each month
  for (const account of bankAccounts) {
    for (const month of monthsToCheck) {
      const hasFile = importedFiles.some(
        f => f.fileType === 'bank' && f.accountNumber === account && f.processingMonth === month
      )

      if (!hasFile) {
        const priority: Priority = 'low'
        const deadline = getAutoTaskDeadline(month)
        tasks.push({
          id: `missing-bank-${account}-${month}`,
          title: `[${month}] חסר קובץ בנק ${account}`,
          description: `לא נמצא קובץ בנק מיובא עבור חשבון ${account} לחודש ${month}`,
          type: 'missing-file',
          priority,
          quadrant: computeAutoTaskQuadrant(deadline),
          deadline: deadline.toISOString(),
          link: `${routes.import}?month=${encodeURIComponent(month)}`,
          createdAt: new Date().toISOString(),
          month,
        })
      }
    }
  }

  // Check for missing credit card files for each month
  for (const card of creditCards) {
    for (const month of monthsToCheck) {
      const hasFile = importedFiles.some(
        f => f.fileType === 'credit-card' && f.cardNumber === card && f.processingMonth === month
      )

      if (!hasFile) {
        const priority: Priority = 'low'
        const deadline = getAutoTaskDeadline(month)
        tasks.push({
          id: `missing-credit-${card}-${month}`,
          title: `[${month}] חסר קובץ כרטיס אשראי ${card}`,
          description: `לא נמצא קובץ כרטיס אשראי מיובא עבור כרטיס ${card} לחודש ${month}`,
          type: 'missing-file',
          priority,
          quadrant: computeAutoTaskQuadrant(deadline),
          deadline: deadline.toISOString(),
          link: `${routes.import}?month=${encodeURIComponent(month)}`,
          createdAt: new Date().toISOString(),
          month,
        })
      }
    }
  }

  // Filter tasks by account ownership (household feature)
  return tasks.filter(task => {
    if (task.id.startsWith('missing-bank-')) {
      const match = task.id.match(/^missing-bank-(.+)-\d{2}\/\d{4}$/)
      if (match) return isAccountVisibleToUser(`bank:${match[1]}`, owners, currentUid)
    } else if (task.id.startsWith('missing-credit-')) {
      const match = task.id.match(/^missing-credit-(.+)-\d{2}\/\d{4}$/)
      if (match) return isAccountVisibleToUser(`card:${match[1]}`, owners, currentUid)
    }
    return true
  })
}

async function checkUncategorizedTransactions(currentMonth: string, owners: AccountOwners, currentUid: string | undefined): Promise<AutoTask[]> {
  const tasks: AutoTask[] = []

  // Get budget transactions for current month
  const transactions = await transactionStore.getBudgetTransactions(currentMonth)

  // Filter to only transactions visible to current user based on account ownership
  const visibleTransactions = transactions.filter(t => {
    let accountKey: string
    if (t.paymentMethod.startsWith('💳')) {
      accountKey = `card:${t.paymentMethod.replace('💳 ', '')}`
    } else {
      accountKey = `bank:${t.paymentMethod}`
    }
    return isAccountVisibleToUser(accountKey, owners, currentUid)
  })

  const uncategorized = visibleTransactions.filter(t => !t.category || t.category.trim() === '')

  if (uncategorized.length > 0) {
    const deadline = getAutoTaskDeadline(currentMonth)
    tasks.push({
      id: `uncategorized-${currentMonth}`,
      title: `[${currentMonth}] יש ${uncategorized.length} עסקאות לא מסווגות`,
      description: `נמצאו עסקאות בחודש ${currentMonth} שטרם סווגו לנושאים`,
      type: 'uncategorized',
      priority: 'low',
      quadrant: computeAutoTaskQuadrant(deadline),
      deadline: deadline.toISOString(),
      link: `${routes.budget}?filter=unclassified&month=${encodeURIComponent(currentMonth)}`,
      createdAt: new Date().toISOString(),
      month: currentMonth,
    })
  }

  return tasks
}

function getNextDueDate(task: BusinessTask): Date | null {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  switch (task.recurrence) {
    case 'monthly': {
      const day = task.dueDay || 1
      let due = new Date(y, m, day)
      if (due < now) due = new Date(y, m + 1, day)
      return due
    }
    case 'weekly': {
      const targetDay = task.dueDay ?? 0
      const currentDay = now.getDay()
      let daysUntil = targetDay - currentDay
      if (daysUntil <= 0) daysUntil += 7
      const due = new Date(now)
      due.setDate(due.getDate() + daysUntil)
      due.setHours(0, 0, 0, 0)
      return due
    }
    case 'yearly': {
      const day = task.dueDay || 1
      const month = (task.dueMonth || 1) - 1
      let due = new Date(y, month, day)
      if (due < now) due = new Date(y + 1, month, day)
      return due
    }
    case 'once': {
      if (task.completed) return null
      const day = task.dueDay || now.getDate()
      const month = (task.dueMonth || (m + 1)) - 1
      return new Date(y, month, day)
    }
  }
}

async function checkRecurringBusinessTasks(): Promise<AutoTask[]> {
  const tasks: AutoTask[] = []
  const now = new Date()
  const currentMonth = getCurrentMonth()

  const allBizTasks = await db.businessTasks.toArray()
  const businesses = await db.businesses.toArray()
  const bizMap = new Map(businesses.map(b => [b.syncId, b]))

  for (const bt of allBizTasks) {
    if (bt.archived) continue
    if (bt.recurrence === 'once' && bt.completed) continue

    const dueDate = getNextDueDate(bt)
    if (!dueDate) continue

    const reminderDays = bt.reminderDaysBefore ?? 3
    const reminderDate = new Date(dueDate)
    reminderDate.setDate(reminderDate.getDate() - reminderDays)

    // Only show if we're within the reminder window
    if (now < reminderDate) continue

    const biz = bt.businessId ? bizMap.get(bt.businessId) : undefined
    const bizName = biz?.name || ''
    const priority: Priority = bt.priority || 'medium'
    const quadrant = computeAutoTaskQuadrant(dueDate)

    tasks.push({
      id: `recurring-${bt.id}-${dueDate.toISOString().slice(0, 10)}`,
      title: `${bizName ? `[${bizName}] ` : ''}${bt.title}`,
      description: bt.description || '',
      type: 'recurring',
      priority,
      quadrant,
      deadline: dueDate.toISOString(),
      link: `${routes.business({ id: biz?.id, slug: biz?.slug })}?tab=tasks`,
      createdAt: bt.createdAt,
      month: currentMonth,
    })
  }

  return tasks
}

/**
 * Generate auto-tasks for the logged-in user's BTL advance payments.
 *
 * Status rules (same as the TaxesTab BTL section):
 * - A transaction classified under "ביטוח לאומי*" in the payment month (i+1)
 *   counts as paid → no task.
 * - Deadline = schedule.dueDate (when a BTL notice is uploaded and extracted),
 *   else the 15th of the payment month.
 * - Today > deadline → overdue → high priority, Q1 (עשה עכשיו).
 * - Deadline within 5 days (10-15 of payment month) → due-soon → medium, Q2.
 * - Earlier than that → skip (no task yet).
 *
 * Only runs when the person has a downpayment configured — either a schedule
 * in `taxProfile.btlNotices[year]` or a flat `btlAdvancePayment`.
 */
async function checkBtlPaymentReminders(): Promise<AutoTask[]> {
  const uid = getUser()?.uid
  if (!uid) return []

  const profile = await getTaxProfile(uid)
  const year = new Date().getFullYear()
  const currentMonthIdx = new Date().getMonth()

  const schedule = profile.btlNotices?.find((n) => n.year === year)?.schedule || []
  const scheduleByMonth = new Map(schedule.map((s) => [s.month, s]))
  const fallbackAmount = profile.btlAdvancePayment || 0

  if (schedule.length === 0 && fallbackAmount === 0) return []

  // Link target per task:
  //   1. The month's QR payment URL (decoded from the notice), if present.
  //   2. Else the most recently uploaded BTL notice file in Drive.
  //   3. Else /app/taxes.
  const latestNotice = (profile.btlNotices || [])
    .filter((n) => n.driveWebViewLink)
    .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))[0]
  const fallbackLink = latestNotice?.driveWebViewLink || '/app/taxes'

  const allTx = await db.transactions.toArray()
  const btlTx = allTx.filter(
    (t) => t.category?.startsWith('ביטוח לאומי') && t.month?.endsWith(`/${year}`),
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tasks: AutoTask[] = []

  for (let i = 0; i <= currentMonthIdx; i++) {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${year}`
    const scheduled = scheduleByMonth.get(monthStr)
    const expected = scheduled?.amount ?? fallbackAmount
    if (expected === 0) continue

    // Payment for month i is recorded in month i+1.
    const nextIdx = i + 1
    const payMonth = nextIdx >= 12 ? `01/${year + 1}` : `${String(nextIdx + 1).padStart(2, '0')}/${year}`

    const paid = btlTx.some((t) => t.month === payMonth)
    if (paid) continue

    let deadline: Date
    if (scheduled?.dueDate) {
      deadline = new Date(scheduled.dueDate)
    } else {
      const [pm, py] = payMonth.split('/').map(Number)
      deadline = new Date(py, pm - 1, 15)
    }
    deadline.setHours(0, 0, 0, 0)

    const windowStart = new Date(deadline)
    windowStart.setDate(windowStart.getDate() - 5)

    let priority: Priority
    let quadrant: EisenhowerQuadrant
    let titlePrefix: string
    if (today > deadline) {
      priority = 'high'
      quadrant = 'do'
      titlePrefix = '🚨 באיחור — ביטוח לאומי'
    } else if (today >= windowStart) {
      priority = 'medium'
      quadrant = 'schedule'
      titlePrefix = '⏰ לתשלום — ביטוח לאומי'
    } else {
      continue
    }

    tasks.push({
      id: `btl-${uid}-${year}-${String(i + 1).padStart(2, '0')}`,
      title: `${titlePrefix} ${MONTH_NAMES_HE[i]} ${year}`,
      description: `${expected.toLocaleString('he-IL')} ₪ · עד ${deadline.toLocaleDateString('he-IL')}`,
      type: 'expected-payment',
      priority,
      quadrant,
      deadline: deadline.toISOString(),
      link: scheduled?.paymentUrl || fallbackLink,
      createdAt: new Date().toISOString(),
      month: monthStr,
    })
  }

  return tasks
}
