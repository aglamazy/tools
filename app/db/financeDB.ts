import Dexie, { Table } from 'dexie'
import type { CapitalEntry } from '@/app/types/capital'
import type { FinancialInstitution } from '@/app/types/financialInstitution'
import type { Student } from '@/app/types/student'
import type { ProfileQA } from '@/app/types/profileQA'
import type { ScoutResult } from '@/app/types/scoutResult'
import type { ScoutConfig } from '@/app/types/scoutConfig'
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

export interface Task {
  id?: number
  syncId?: string
  title: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
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
  pinnedToSidebar?: boolean
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
  docType: number // 108 = קבלה, 109 = חשבונית מס קבלה
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
  uploadedAt: string
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

  constructor() {
    super('FinanceDB')

    // Define schema version 1
    this.version(1).stores({
      // Transactions table with compound indexes
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',

      // Imported files
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',

      // Categories
      categories: '++id, name, type',
    })

    // Define schema version 2 - add business-category mapping
    this.version(2).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
    })

    // Define schema version 3 - add tasks
    this.version(3).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, createdAt, priority',
    })

    // Define schema version 4 - add app settings
    this.version(4).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, createdAt, priority',
      appSettings: '++id, &key',
    })

    // Define schema version 5 - add businesses
    this.version(5).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, createdAt, priority',
      appSettings: '++id, &key',
      businesses: '++id, &name, type',
    })

    // Define schema version 6 - add harvest (time tracking) tables
    this.version(6).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, createdAt, priority',
      appSettings: '++id, &key',
      businesses: '++id, &name, type',
      projects: '++id, businessId, name, archived',
      harvestTasks: '++id, projectId, name, archived',
      timeEntries: '++id, taskId, date, [taskId+date]',
    })

    // Define schema version 7 - add startTime and endTime to timeEntries
    this.version(7).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, createdAt, priority',
      appSettings: '++id, &key',
      businesses: '++id, &name, type',
      projects: '++id, businessId, name, archived',
      harvestTasks: '++id, projectId, name, archived',
      timeEntries: '++id, taskId, date, startTime, endTime, [taskId+date]',
    }).upgrade(async (trans) => {
      // Migrate existing entries: parse notes field to extract startTime/endTime
      const entries = await trans.table('timeEntries').toArray()
      for (const entry of entries) {
        if (entry.notes) {
          const match = entry.notes.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/)
          if (match) {
            entry.startTime = match[1]
            entry.endTime = match[2]
          } else {
            // Default values if no valid time format
            entry.startTime = '09:00'
            entry.endTime = '17:00'
          }
        } else {
          // Default values for entries without notes
          entry.startTime = '09:00'
          entry.endTime = '17:00'
        }
        delete entry.notes
        await trans.table('timeEntries').put(entry)
      }
    })

    // Define schema version 8 - add capital entries
    this.version(8).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, createdAt, priority',
      appSettings: '++id, &key',
      businesses: '++id, &name, type',
      projects: '++id, businessId, name, archived',
      harvestTasks: '++id, projectId, name, archived',
      timeEntries: '++id, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    })

    // Define schema version 9 - add financial institutions
    this.version(9).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, createdAt, priority',
      appSettings: '++id, &key',
      businesses: '++id, &name, type',
      projects: '++id, businessId, name, archived',
      harvestTasks: '++id, projectId, name, archived',
      timeEntries: '++id, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
      financialInstitutions: '++id, name, type',
    })

    // Define schema version 10 - add ypayDocuments
    this.version(10).stores({
      transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, createdAt, priority',
      appSettings: '++id, &key',
      businesses: '++id, &name, type',
      projects: '++id, businessId, name, archived',
      harvestTasks: '++id, projectId, name, archived',
      timeEntries: '++id, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
      financialInstitutions: '++id, name, type',
      ypayDocuments: '++id, &transactionId',
    })

    // Define schema version 11 - add syncId + updatedAt for merge-on-sync
    this.version(11).stores({
      transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, syncId, name, type',
      businessCategories: '++id, syncId, &business',
      tasks: '++id, syncId, createdAt, priority',
      appSettings: '++id, syncId, &key',
      businesses: '++id, syncId, &name, type',
      projects: '++id, syncId, businessId, name, archived',
      harvestTasks: '++id, syncId, projectId, name, archived',
      timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
      financialInstitutions: '++id, syncId, name, type',
      ypayDocuments: '++id, syncId, &transactionId',
    }).upgrade(async (trans) => {
      const allTableNames = [
        'transactions', 'importedFiles', 'categories', 'businessCategories',
        'tasks', 'appSettings', 'businesses', 'projects', 'harvestTasks',
        'timeEntries', 'capitalEntries', 'financialInstitutions', 'ypayDocuments',
      ]
      for (const tableName of allTableNames) {
        const table = trans.table(tableName)
        const rows = await table.toArray()
        for (const row of rows) {
          const updates: Record<string, string> = {}
          if (!row.syncId) updates.syncId = crypto.randomUUID()
          if (!row.updatedAt) {
            updates.updatedAt = row.importedAt || row.lastUpdated || row.createdAt || new Date().toISOString()
          }
          if (Object.keys(updates).length > 0) {
            await table.update(row.id, updates)
          }
        }
      }
    })

    // Define schema version 12 - add students table for teacher businesses
    this.version(12).stores({
      transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, syncId, name, type',
      businessCategories: '++id, syncId, &business',
      tasks: '++id, syncId, createdAt, priority',
      appSettings: '++id, syncId, &key',
      businesses: '++id, syncId, &name, type',
      projects: '++id, syncId, businessId, name, archived',
      harvestTasks: '++id, syncId, projectId, name, archived',
      timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
      financialInstitutions: '++id, syncId, name, type',
      ypayDocuments: '++id, syncId, &transactionId',
      students: '++id, syncId, businessId, name, archived',
    })

    // Define schema version 13 - add profileQAs table for artist profiles
    this.version(13).stores({
      transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, syncId, name, type',
      businessCategories: '++id, syncId, &business',
      tasks: '++id, syncId, createdAt, priority',
      appSettings: '++id, syncId, &key',
      businesses: '++id, syncId, &name, type',
      projects: '++id, syncId, businessId, name, archived',
      harvestTasks: '++id, syncId, projectId, name, archived',
      timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
      financialInstitutions: '++id, syncId, name, type',
      ypayDocuments: '++id, syncId, &transactionId',
      students: '++id, syncId, businessId, name, archived',
      profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    })

    // Define schema version 14 - add scoutResults and scoutConfigs tables
    this.version(14).stores({
      transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, syncId, name, type',
      businessCategories: '++id, syncId, &business',
      tasks: '++id, syncId, createdAt, priority',
      appSettings: '++id, syncId, &key',
      businesses: '++id, syncId, &name, type',
      projects: '++id, syncId, businessId, name, archived',
      harvestTasks: '++id, syncId, projectId, name, archived',
      timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
      financialInstitutions: '++id, syncId, name, type',
      ypayDocuments: '++id, syncId, &transactionId',
      students: '++id, syncId, businessId, name, archived',
      profileQAs: '++id, syncId, businessId, [businessId+answerType]',
      scoutResults: '++id, syncId, businessId, status, [businessId+status]',
      scoutConfigs: '++id, syncId, &businessId',
    })

    // Define schema version 15 - add taxDocuments table
    this.version(15).stores({
      transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, syncId, name, type',
      businessCategories: '++id, syncId, &business',
      tasks: '++id, syncId, createdAt, priority',
      appSettings: '++id, syncId, &key',
      businesses: '++id, syncId, &name, type',
      projects: '++id, syncId, businessId, name, archived',
      harvestTasks: '++id, syncId, projectId, name, archived',
      timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
      financialInstitutions: '++id, syncId, name, type',
      ypayDocuments: '++id, syncId, &transactionId',
      students: '++id, syncId, businessId, name, archived',
      profileQAs: '++id, syncId, businessId, [businessId+answerType]',
      scoutResults: '++id, syncId, businessId, status, [businessId+status]',
      scoutConfigs: '++id, syncId, &businessId',
      taxDocuments: '++id, syncId, businessId, month, year, [businessId+year]',
    })

    // Auto-inject syncId and updatedAt on create/update
    this.on('ready', () => {
      this.tables.forEach(table => {
        table.hook('creating', (_primKey, obj) => {
          if (!obj.syncId) obj.syncId = crypto.randomUUID()
          if (!obj.updatedAt) obj.updatedAt = new Date().toISOString()
        })
        table.hook('updating', (mods: Record<string, any>) => {
          if (!mods.updatedAt) return { ...mods, updatedAt: new Date().toISOString() }
        })
      })
    })
  }
}

// Export singleton instance
export const db = new FinanceDB()
