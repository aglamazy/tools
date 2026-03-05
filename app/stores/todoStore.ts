import { db, Task } from '@/app/db/financeDB'
import { transactionStore } from './transactionStore'
import { getUser } from './authStore'
import { appSettingsStore, AccountOwners } from './appSettingsStore'
import { routes } from '@/app/config'

type Priority = 'low' | 'medium' | 'high'

export type UserTask = {
  id: number
  title: string
  completed: boolean
  priority: Priority
  createdAt: string
}

export type AutoTask = {
  id: string
  title: string
  description: string
  type: 'missing-file' | 'uncategorized' | 'expected-payment' | 'other'
  priority: Priority
  link: string
  createdAt: string
  month: string // Format: MM/YYYY - the month this task references
}

export const todoStore = {
  async addTask(title: string, priority: Priority): Promise<UserTask> {
    const task: Omit<Task, 'id'> = {
      title,
      completed: false,
      priority,
      createdAt: new Date().toISOString(),
    }
    const id = await db.tasks.add(task)
    return { ...task, id }
  },

  async getAllTasks(): Promise<UserTask[]> {
    const tasks = await db.tasks.toArray()
    return tasks.map(t => ({
      id: t.id!,
      title: t.title,
      completed: t.completed,
      priority: t.priority,
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

    return autoTasks
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
  const importedFiles = await db.importedFiles.toArray()

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
    tasks.push({
      id: `missing-initial-${currentMonth}`,
      title: `[${currentMonth}] לא נמצאו קבצים מיובאים`,
      description: 'יש להתחיל לייבא קבצי בנק וכרטיסי אשראי',
      type: 'missing-file',
      priority: 'high',
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
        // Priority: high for latest month, medium for older months
        const priority: Priority = month === latestMonthInRange ? 'high' : 'medium'
        tasks.push({
          id: `missing-bank-${account}-${month}`,
          title: `[${month}] חסר קובץ בנק ${account}`,
          description: `לא נמצא קובץ בנק מיובא עבור חשבון ${account} לחודש ${month}`,
          type: 'missing-file',
          priority,
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
        // Priority: high for latest month, medium for older months
        const priority: Priority = month === latestMonthInRange ? 'high' : 'medium'
        tasks.push({
          id: `missing-credit-${card}-${month}`,
          title: `[${month}] חסר קובץ כרטיס אשראי ${card}`,
          description: `לא נמצא קובץ כרטיס אשראי מיובא עבור כרטיס ${card} לחודש ${month}`,
          type: 'missing-file',
          priority,
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
    tasks.push({
      id: `uncategorized-${currentMonth}`,
      title: `[${currentMonth}] יש ${uncategorized.length} עסקאות לא מסווגות`,
      description: `נמצאו עסקאות בחודש ${currentMonth} שטרם סווגו לנושאים`,
      type: 'uncategorized',
      priority: uncategorized.length > 20 ? 'high' : 'medium',
      link: `${routes.budget}?filter=unclassified&month=${encodeURIComponent(currentMonth)}`,
      createdAt: new Date().toISOString(),
      month: currentMonth,
    })
  }

  return tasks
}
