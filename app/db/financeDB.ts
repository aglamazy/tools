import Dexie, { Table } from 'dexie'
import type { CapitalEntry } from '@/app/types/capital'
import type { FinancialInstitution } from '@/app/types/financialInstitution'

// Re-export types for convenience
export type { CapitalEntry } from '@/app/types/capital'
export type { FinancialInstitution } from '@/app/types/financialInstitution'

// Transaction type (unified for bank and credit card)
export interface Transaction {
  id?: number // Auto-increment primary key
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
  fileId: string // Reference to imported file
}

export interface ImportedFile {
  id?: number
  fileName: string
  fileType: 'bank' | 'credit-card'
  processingMonth: string
  fileKey?: string
  accountNumber?: string
  cardNumber?: string
  transactionCount: number
  importedAt: string
}

export interface Category {
  id?: number
  name: string
  type: 'income' | 'expense'
  icon?: string
  color?: string
}

export interface BusinessCategory {
  id?: number
  business: string
  category: string
  lastUpdated: string
}

export interface Task {
  id?: number
  title: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  createdAt: string
}

export interface AppSettings {
  id?: number
  key: string // e.g., 'cardTypeIndicators'
  value: any // Store any JSON-serializable value
  updatedAt: string
}

export interface Business {
  id?: number
  name: string
  type: 'personal' | 'business'
  vatType?: 'exempt' | 'authorized'
  pinnedToSidebar?: boolean
  createdAt: string
  updatedAt: string
}

// Harvest (Time Tracking) interfaces
export interface Project {
  id?: number
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
  projectId: number
  name: string
  hourlyRate?: number
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface TimeEntry {
  id?: number
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
  transactionId: string // Unique reference to the transaction
  url: string // Link to the PDF document
  serialNumber: string // Document serial number from YPAY
  docType: number // 108 = קבלה, 109 = חשבונית מס קבלה
  createdAt: string // ISO timestamp
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
  }
}

// Export singleton instance
export const db = new FinanceDB()
