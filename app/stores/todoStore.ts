import { db, Task } from '@/app/db/financeDB'
import { transactionStore } from './transactionStore'

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

    // Check for missing files (bank and credit cards) for default 3-month period
    const missingFileTasks = await checkMissingFiles(defaultPeriod)
    autoTasks.push(...missingFileTasks)

    // Check for uncategorized transactions in default 3-month period
    for (const month of defaultPeriod) {
      const uncategorizedTasks = await checkUncategorizedTransactions(month)
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

async function checkMissingFiles(months: string[]): Promise<AutoTask[]> {
  const tasks: AutoTask[] = []
  const importedFiles = await db.importedFiles.toArray()

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

  // Check for missing bank files for each month
  for (const account of bankAccounts) {
    for (let i = 0; i < months.length; i++) {
      const month = months[i]
      const hasFile = importedFiles.some(
        f => f.fileType === 'bank' && f.accountNumber === account && f.processingMonth === month
      )

      if (!hasFile) {
        // Priority: high for latest month, medium for older months
        const priority: Priority = i === 0 ? 'high' : 'medium'
        tasks.push({
          id: `missing-bank-${account}-${month}`,
          title: `[${month}] חסר קובץ בנק`,
          description: `לא נמצא קובץ בנק מיובא עבור חשבון ${account} לחודש ${month}`,
          type: 'missing-file',
          priority,
          link: '/tools/import',
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  // Check for missing credit card files for each month
  for (const card of creditCards) {
    for (let i = 0; i < months.length; i++) {
      const month = months[i]
      const hasFile = importedFiles.some(
        f => f.fileType === 'credit-card' && f.cardNumber === card && f.processingMonth === month
      )

      if (!hasFile) {
        // Priority: high for latest month, medium for older months
        const priority: Priority = i === 0 ? 'high' : 'medium'
        tasks.push({
          id: `missing-credit-${card}-${month}`,
          title: `[${month}] חסר קובץ כרטיס אשראי ${card}`,
          description: `לא נמצא קובץ כרטיס אשראי מיובא עבור כרטיס ${card} לחודש ${month}`,
          type: 'missing-file',
          priority,
          link: '/tools/import',
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  return tasks
}

async function checkUncategorizedTransactions(currentMonth: string): Promise<AutoTask[]> {
  const tasks: AutoTask[] = []

  // Get budget transactions for current month
  const transactions = await transactionStore.getBudgetTransactions(currentMonth)
  const uncategorized = transactions.filter(t => !t.category || t.category.trim() === '')

  if (uncategorized.length > 0) {
    tasks.push({
      id: `uncategorized-${currentMonth}`,
      title: `[${currentMonth}] יש ${uncategorized.length} עסקאות לא מסווגות`,
      description: `נמצאו עסקאות בחודש ${currentMonth} שטרם סווגו לנושאים`,
      type: 'uncategorized',
      priority: uncategorized.length > 20 ? 'high' : 'medium',
      link: '/tools/budget?filter=unclassified',
      createdAt: new Date().toISOString(),
    })
  }

  return tasks
}
