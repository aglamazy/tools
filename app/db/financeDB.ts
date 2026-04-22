import Dexie, { Table } from 'dexie'
import { defineSchemaVersions } from './schemaVersions'
import type { CapitalEntry } from '@/app/types/capital'
import type { FinancialInstitution } from '@/app/types/financialInstitution'
import type { Student } from '@/app/types/student'
import type { ProfileQA } from '@/app/types/profileQA'
import type { ScoutResult } from '@/app/types/scoutResult'
import type { ScoutConfig } from '@/app/types/scoutConfig'
import type { AgentTaskStatus } from '@/app/types/bot'
import { BusinessType } from '@/app/types/business'

// Re-export types for convenience
export type { CapitalEntry } from '@/app/types/capital'
export type { FinancialInstitution } from '@/app/types/financialInstitution'
export type { Student } from '@/app/types/student'
export type { ProfileQA } from '@/app/types/profileQA'
export type { ScoutResult } from '@/app/types/scoutResult'
export type { ScoutConfig } from '@/app/types/scoutConfig'

// Transaction type (unified for bank and credit card)
export interface Transaction {
  id?: number // Auto-increment primary key
  syncId?: string // UUID for cross-device identity
  type: string
  date: string // Transaction date (DD/MM/YYYY)
  amount: number
  description: string
  category?: string
  isFixed: boolean

  // Bank-specific fields
  accountNumber?: string
  balance?: number
  isCreditCardCharge?: boolean

  // Credit card-specific fields
  cardNumber?: string
  merchant?: string
  chargingDate?: string // DD/MM/YYYY - when charged to bank account
  currentStep?: number
  totalSteps?: number
  totalAmount?: number // Full purchase price for installments

  // Metadata
  month: string // MM/YYYY - transaction month (extracted from date field)
  importedAt: string // ISO timestamp
  updatedAt?: string // ISO timestamp, auto-updated
  fileId: string // Reference to imported file
}

export interface ImportedFile {
  id?: number
  syncId?: string
  fileName: string
  fileType: 'bank' | 'credit-card'
  processingMonth: string
  fileKey?: string
  accountNumber?: string
  cardNumber?: string
  transactionCount: number
  importedAt: string
  updatedAt?: string
}

export interface Category {
  id?: number
  syncId?: string
  name: string
  type: 'income' | 'expense'
  icon?: string
  color?: string
  updatedAt?: string
}

export interface BusinessCategory {
  id?: number
  syncId?: string
  business: string
  category: string
  lastUpdated: string
}

export type EisenhowerQuadrant = 'do' | 'schedule' | 'delegate' | 'eliminate'

export type TaskType = 'personal' | 'lead' | 'auto'

export interface LeadTaskExt {
  kind: 'lead'
  links: { text: string; url: string }[]
  address?: string
  leadTags?: string[]
  applicationStatus?: 'new' | 'reviewing' | 'applying' | 'sent' | 'rejected' | 'accepted'
  phone?: string
  notes?: string
}
export type TaskExtensions = LeadTaskExt

export interface Task {
  id?: number
  syncId?: string
  title: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  quadrant: EisenhowerQuadrant
  deadline?: string // ISO date string (default: 10th of current month)
  snoozedUntil?: string // ISO date — task hidden until this date
  autoTaskId?: string // For auto-task snooze records (e.g. "missing-bank-123-01/2026")
  delegatedTo?: string // Firebase UID of partner
  delegatedBy?: string // Firebase UID of delegator
  botId?: string // Bot ID when delegated to a bot
  agentTaskId?: string // Firestore agent task doc ID
  agentStatus?: AgentTaskStatus // Bot task status
  agentResult?: string // Bot task result
  taskType?: TaskType
  subject?: string // groups tasks (e.g. import filename)
  tags?: string[]
  ext?: TaskExtensions
  createdAt: string
  updatedAt?: string
}

export interface AppSettings {
  id?: number
  syncId?: string
  key: string // e.g., 'cardTypeIndicators'
  value: any // Store any JSON-serializable value
  updatedAt: string
}

export interface Business {
  id?: number
  syncId?: string
  name: string
  type: BusinessType
  vatType?: 'exempt' | 'authorized'
  isTaxFree?: boolean
  ypayClientId?: string
  ypayClientSecret?: string
  btlAdvancePayment?: number // מקדמות ביטוח לאומי — monthly advance set by BTL
  incomeTaxAdvancePercent?: number // מקדמות מס הכנסה — % of monthly income
  incomeTaxAdvancePeriod?: 1 | 2 // תקופת תשלום מקדמות — 1=חודשי, 2=דו-חודשי
  taxOrder?: number // סדר לחישוב מס — 1=ראשון (מדרגות נמוכות), 2=שני, וכו׳
  pinnedToSidebar?: boolean
  sharedWithMe?: boolean // true for businesses shared by another user
  userId?: string // Firebase UID of the owning user
  createdAt: string
  updatedAt: string
}

// Harvest (Time Tracking) interfaces
export interface Project {
  id?: number
  syncId?: string
  businessId: number
  name: string
  color?: string
  defaultHourlyRate?: number
  contactEmail?: string
  contactBusinessID?: string  // ח.פ
  contactPhone?: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface HarvestTask {
  id?: number
  syncId?: string
  projectId: number
  name: string
  hourlyRate?: number
  assignedTo?: string // email of assigned team member
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface TimeEntry {
  id?: number
  syncId?: string
  taskId: number
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string // HH:MM
  hours: number
  createdAt: string
  updatedAt: string
}

export interface YpayDocument {
  id?: number
  syncId?: string
  transactionId: string // Unique reference to the transaction
  url: string // Link to the PDF document
  serialNumber: string // Document serial number from YPAY
  docType: number // 104 = חשבונית עסקה, 108 = קבלה, 109 = חשבונית מס קבלה
  amount?: number // Document total amount
  projectName?: string // For business invoices
  monthName?: string // For business invoices
  paidAt?: string // ISO timestamp when payment was received
  createdAt: string // ISO timestamp
  updatedAt?: string
}

export interface TaxDocument {
  id?: number
  syncId?: string
  businessId: number
  fileName: string
  driveFileId?: string // Google Drive file ID
  driveWebViewLink?: string // Google Drive view URL
  month: string // MM/YYYY - payslip period
  year: number
  grossIncome?: number // הכנסה ברוטו
  incomeTax?: number // ניכוי מס הכנסה
  nationalInsurance?: number // ביטוח לאומי
  healthInsurance?: number // ביטוח בריאות
  netIncome?: number // נטו
  employer?: string
  annualTaxableIncome?: number // הכנסה שנתית לנמס
  extractedData?: any // Raw extraction JSON
  userId?: string // Firebase UID of the owning user
  uploadedAt: string
  updatedAt?: string
}

export type RecurrenceType = 'monthly' | 'weekly' | 'yearly' | 'once'

export interface BusinessTask {
  id?: number
  syncId?: string
  businessId: number
  title: string
  description?: string
  recurrence: RecurrenceType
  dueDay?: number          // Day of month (1-31) for monthly, day of week (0-6) for weekly, day of year (1-365) for yearly
  dueMonth?: number        // Month (1-12) for yearly recurrence
  reminderDaysBefore?: number // Days before due date to show in todo
  priority: 'low' | 'medium' | 'high'
  attachmentDriveFileId?: string
  attachmentDriveWebViewLink?: string
  attachmentFileName?: string
  completed?: boolean      // For one-time tasks
  archived?: boolean
  createdAt: string
  updatedAt?: string
}

export interface ExpenseDocument {
  id?: number
  syncId?: string
  transactionId?: number // Link to a transaction row
  fileName: string
  driveFileId?: string // Google Drive file ID
  driveWebViewLink?: string // Google Drive view URL
  date?: string // DD/MM/YYYY - expense date
  vendor?: string // Vendor / merchant name
  amount?: number // Total amount from document
  vatAmount?: number // VAT amount (מע״מ)
  category?: string // Expense category
  description?: string // Expense description
  extractedData?: any // Raw extraction JSON
  mismatch?: boolean // True if extracted data doesn't match linked transaction
  mismatchDetails?: string // Description of mismatches found
  sourceType?: 'upload' | 'gmail' // How the document was attached
  gmailMessageId?: string // Gmail message ID if attached from Gmail
  uploadedAt: string
  updatedAt?: string
}

export interface AdvancePayment {
  id?: number
  syncId?: string
  businessId: number
  month: string // MM/YYYY - the payment period month
  type: 'incomeTax' | 'btl'
  paidAt?: string // ISO timestamp — null = waiting
  driveFileId?: string
  driveWebViewLink?: string
  fileName?: string
  userId?: string
  createdAt: string
  updatedAt?: string
}

// Chat persistence (v26) — multi-thread chat with per-message rows.
// Replaces the old localStorage-only single-thread store. Both tables
// participate in encrypted sync via SYNCED_DB_TABLES.
export interface Chat {
  id: string          // uuid (string PK — not auto-increment)
  syncId?: string
  uid: string         // owner Firebase UID
  title: string       // user-editable; default "שיחה חדשה" until first user msg
  createdAt: string   // ISO
  updatedAt: string   // ISO
  msgCount: number    // cached message count for sorting without scanning messages
}

export interface ChatMessageRow {
  id: string          // uuid
  syncId?: string
  chatId: string      // FK → Chat.id
  uid: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  createdAt: string   // ISO
  updatedAt?: string
}

class FinanceDB extends Dexie {
  transactions!: Table<Transaction, number>
  importedFiles!: Table<ImportedFile, number>
  categories!: Table<Category, number>
  businessCategories!: Table<BusinessCategory, number>
  tasks!: Table<Task, number>
  appSettings!: Table<AppSettings, number>
  businesses!: Table<Business, number>
  projects!: Table<Project, number>
  harvestTasks!: Table<HarvestTask, number>
  timeEntries!: Table<TimeEntry, number>
  capitalEntries!: Table<CapitalEntry, number>
  financialInstitutions!: Table<FinancialInstitution, number>
  ypayDocuments!: Table<YpayDocument, number>
  students!: Table<Student, number>
  profileQAs!: Table<ProfileQA, number>
  scoutResults!: Table<ScoutResult, number>
  scoutConfigs!: Table<ScoutConfig, number>
  taxDocuments!: Table<TaxDocument, number>
  expenseDocuments!: Table<ExpenseDocument, number>
  businessTasks!: Table<BusinessTask, number>
  advancePayments!: Table<AdvancePayment, number>
  chats!: Table<Chat, string>
  chatMessages!: Table<ChatMessageRow, string>

  constructor() {
    super('FinanceDB')

    defineSchemaVersions(this)

    // Tables that participate in sync (auto-track deletions for these)
    const syncedTables = new Set([
      'businesses', 'categories', 'appSettings', 'businessCategories',
      'importedFiles', 'transactions', 'tasks', 'financialInstitutions',
      'capitalEntries', 'ypayDocuments', 'projects', 'harvestTasks',
      'timeEntries', 'taxDocuments', 'advancePayments', 'businessTasks',
      'chats', 'chatMessages',
    ])

    // Auto-inject syncId/updatedAt on create/update, and record deletions
    // Serialized queue for deletion ledger updates to avoid read-modify-write races
    let deletionQueue: { tableName: string; syncId: string }[] = []
    let deletionFlushScheduled = false
    const flushDeletionQueue = () => {
      deletionFlushScheduled = false
      const batch = deletionQueue.splice(0)
      if (batch.length === 0) return
      this.appSettings.where('key').equals('deletedRecords').first().then(setting => {
        const ledger: Record<string, string[]> = setting?.value as Record<string, string[]> || {}
        for (const { tableName, syncId } of batch) {
          if (!ledger[tableName]) ledger[tableName] = []
          if (!ledger[tableName].includes(syncId)) ledger[tableName].push(syncId)
        }
        if (setting) {
          this.appSettings.update(setting.id!, { value: ledger, updatedAt: new Date().toISOString() })
        } else {
          this.appSettings.add({ key: 'deletedRecords', value: ledger, updatedAt: new Date().toISOString() })
        }
      }).catch(err => console.error('[DB] deletion ledger error:', err))
    }

    this.on('ready', () => {
      this.tables.forEach(table => {
        table.hook('creating', (_primKey, obj) => {
          if (!obj.syncId) obj.syncId = crypto.randomUUID()
          if (!obj.updatedAt) obj.updatedAt = new Date().toISOString()
        })
        table.hook('updating', (mods: Record<string, any>) => {
          if (!mods.updatedAt) return { ...mods, updatedAt: new Date().toISOString() }
        })
        // Auto-record deletion in ledger for synced tables
        if (syncedTables.has(table.name) && table.name !== 'appSettings') {
          table.hook('deleting', (_primKey, obj) => {
            if (!obj?.syncId) return
            deletionQueue.push({ tableName: table.name, syncId: obj.syncId as string })
            if (!deletionFlushScheduled) {
              deletionFlushScheduled = true
              setTimeout(flushDeletionQueue, 0)
            }
          })
        }
      })
    })
  }
}

// Export singleton instance
export const db = new FinanceDB()
