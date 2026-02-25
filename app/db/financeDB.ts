import Dexie, { Table } from 'dexie'
import type { CapitalEntry } from '@/app/types/capital'
import type { FinancialInstitution } from '@/app/types/financialInstitution'

// Re-export types for convenience
export type { CapitalEntry } from '@/app/types/capital'
export type { FinancialInstitution } from '@/app/types/financialInstitution'

/** Generate a UUID v4 */
export function generateSyncId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

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
  fileId: string // Reference to imported file
  updatedAt?: string // ISO timestamp
  deletedAt?: string // ISO timestamp - soft delete
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
  deletedAt?: string
}

export interface Category {
  id?: number
  name: string // Natural key - no syncId needed
  type: 'income' | 'expense'
  icon?: string
  color?: string
  updatedAt?: string
  deletedAt?: string
}

export interface BusinessCategory {
  id?: number
  business: string // Natural key - no syncId needed
  category: string
  lastUpdated: string
  deletedAt?: string
}

export interface Task {
  id?: number
  syncId?: string
  title: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  createdAt: string
  updatedAt?: string
  deletedAt?: string
}

export interface AppSettings {
  id?: number
  key: string // Natural key - no syncId needed
  value: any // Store any JSON-serializable value
  updatedAt: string
  deletedAt?: string
}

export interface Business {
  id?: number
  syncId?: string
  name: string
  type: 'personal' | 'business'
  vatType?: 'exempt' | 'authorized'
  pinnedToSidebar?: boolean
  createdAt: string
  updatedAt: string
  deletedAt?: string
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
  deletedAt?: string
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
  deletedAt?: string
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
  deletedAt?: string
}

export interface YpayDocument {
  id?: number
  transactionId: string // Natural key - no syncId needed
  url: string // Link to the PDF document
  serialNumber: string // Document serial number from YPAY
  docType: number // 108 = קבלה, 109 = חשבונית מס קבלה
  createdAt: string // ISO timestamp
  updatedAt?: string
  deletedAt?: string
}

export interface Vacation {
  id?: number
  syncId?: string
  from: string // Origin
  to: string // Destination
  windowStart?: string // YYYY-MM-DD - earliest acceptable date
  windowEnd?: string // YYYY-MM-DD - latest acceptable date
  createdAt: string // ISO timestamp
  updatedAt?: string
  deletedAt?: string
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
  vacations!: Table<Vacation, number>

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

    // Define schema version 11 - add vacations
    this.version(11).stores({
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
      vacations: '++id, createdAt',
    })

    // Define schema version 12 - merge-on-sync: add syncId, updatedAt, deletedAt
    // syncId indexed on tables that use UUID identity (not natural-key tables)
    // Natural-key tables: categories (name), businessCategories (business), appSettings (key), ypayDocuments (transactionId)
    this.version(12).stores({
      transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
      importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
      categories: '++id, name, type',
      businessCategories: '++id, &business',
      tasks: '++id, syncId, createdAt, priority',
      appSettings: '++id, &key',
      businesses: '++id, syncId, &name, type',
      projects: '++id, syncId, businessId, name, archived',
      harvestTasks: '++id, syncId, projectId, name, archived',
      timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
      capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
      financialInstitutions: '++id, syncId, name, type',
      ypayDocuments: '++id, &transactionId',
      vacations: '++id, syncId, createdAt',
    }).upgrade(async (trans) => {
      const now = new Date().toISOString()

      // Tables that get syncId (UUID identity)
      const syncIdTables = [
        'transactions', 'importedFiles', 'tasks', 'businesses',
        'projects', 'harvestTasks', 'timeEntries', 'capitalEntries',
        'financialInstitutions', 'vacations',
      ]

      for (const tableName of syncIdTables) {
        const table = trans.table(tableName)
        const records = await table.toArray()
        for (const record of records) {
          const updates: any = {}
          if (!record.syncId) {
            updates.syncId = generateSyncId()
          }
          if (!record.updatedAt) {
            updates.updatedAt = record.createdAt || record.importedAt || now
          }
          if (Object.keys(updates).length > 0) {
            await table.update(record.id, updates)
          }
        }
      }

      // Natural-key tables that only need updatedAt (no syncId)
      const naturalKeyUpdates: Array<{ table: string; fallbackField: string }> = [
        { table: 'categories', fallbackField: '' },
        { table: 'ypayDocuments', fallbackField: 'createdAt' },
      ]

      for (const { table: tableName, fallbackField } of naturalKeyUpdates) {
        const table = trans.table(tableName)
        const records = await table.toArray()
        for (const record of records) {
          if (!record.updatedAt) {
            const fallback = fallbackField ? record[fallbackField] : now
            await table.update(record.id, { updatedAt: fallback || now })
          }
        }
      }

      console.log('[FinanceDB] v12 migration complete: syncId + updatedAt added to all records')
    })
  }
}

// Export singleton instance
export const db = new FinanceDB()

// --- Sync Middleware ---
// Automatically handles syncId injection, updatedAt timestamps,
// soft-delete conversion, and read filtering for ALL tables.
// No per-store changes needed.

/** Tables that use syncId (UUID) as cross-device identity */
const SYNC_ID_TABLES = new Set([
  'transactions', 'importedFiles', 'tasks', 'businesses',
  'projects', 'harvestTasks', 'timeEntries', 'capitalEntries',
  'financialInstitutions', 'vacations',
])

/** All tables that participate in soft-delete */
const SOFT_DELETE_TABLES = new Set([
  ...SYNC_ID_TABLES,
  'categories', 'businessCategories', 'appSettings', 'ypayDocuments',
])

let _rawAccess = false

/**
 * Execute fn with raw DB access:
 * - Reads include soft-deleted records
 * - Deletes are real deletes (not soft-delete)
 * Used by backup export and merge operations.
 */
export async function withRawAccess<T>(fn: () => Promise<T>): Promise<T> {
  _rawAccess = true
  try {
    return await fn()
  } finally {
    _rawAccess = false
  }
}

db.use({
  stack: 'dbcore',
  name: 'SyncMiddleware',
  create(downlevelDatabase) {
    return {
      ...downlevelDatabase,
      table(tableName: string) {
        const downTable = downlevelDatabase.table(tableName)
        const usesSyncId = SYNC_ID_TABLES.has(tableName)
        const usesSoftDelete = SOFT_DELETE_TABLES.has(tableName)

        // Tables that don't participate in sync — pass through unchanged
        if (!usesSoftDelete && !usesSyncId) return downTable

        return {
          ...downTable,

          // --- WRITES ---
          mutate(req: any) {
            const now = new Date().toISOString()

            if (req.type === 'add') {
              const values = req.values.map((v: any) => {
                const clone = { ...v }
                if (usesSyncId && !clone.syncId) clone.syncId = generateSyncId()
                if (!clone.updatedAt) clone.updatedAt = now
                return clone
              })
              return downTable.mutate({ ...req, values })
            }

            if (req.type === 'put') {
              const values = req.values.map((v: any) => {
                const clone = { ...v }
                if (usesSyncId && !clone.syncId) clone.syncId = generateSyncId()
                // Always stamp updatedAt on puts unless value already has one
                // (the caller may have set it intentionally)
                if (!clone.updatedAt) clone.updatedAt = now
                return clone
              })
              // Also inject updatedAt into changeSpec (used by Table.update/modify)
              let { changeSpec, updates } = req
              if (changeSpec && !changeSpec.updatedAt) {
                changeSpec = { ...changeSpec, updatedAt: now }
              }
              if (updates) {
                updates = {
                  ...updates,
                  changeSpecs: updates.changeSpecs.map((cs: any) =>
                    cs.updatedAt ? cs : { ...cs, updatedAt: now }
                  ),
                }
              }
              return downTable.mutate({ ...req, values, changeSpec, updates })
            }

            // Soft-delete: convert delete-by-keys to put-with-deletedAt
            if (usesSoftDelete && !_rawAccess && req.type === 'delete') {
              return (async () => {
                const existing = await downTable.getMany({ trans: req.trans, keys: req.keys })
                const toPut = existing
                  .filter((r: any) => r != null && !r.deletedAt)
                  .map((r: any) => ({ ...r, deletedAt: now, updatedAt: now }))
                if (toPut.length === 0) {
                  return { numFailures: 0, failures: {}, lastResult: undefined, results: [] }
                }
                return downTable.mutate({ type: 'put', trans: req.trans, values: toPut })
              })()
            }

            // Soft-delete: convert deleteRange
            if (usesSoftDelete && !_rawAccess && req.type === 'deleteRange') {
              // Range type 3 = DBCoreRangeType.Any = clear() → real delete
              if (req.range?.type === 3) {
                return downTable.mutate(req)
              }
              // Other ranges (e.g. Collection.delete()) → soft-delete
              return (async () => {
                const queryResult = await downTable.query({
                  trans: req.trans,
                  query: { index: downTable.schema.primaryKey, range: req.range },
                  values: true,
                })
                const toPut = queryResult.result
                  .filter((r: any) => !r.deletedAt)
                  .map((r: any) => ({ ...r, deletedAt: now, updatedAt: now }))
                if (toPut.length === 0) {
                  return { numFailures: 0, failures: {}, lastResult: undefined, results: [] }
                }
                return downTable.mutate({ type: 'put', trans: req.trans, values: toPut })
              })()
            }

            return downTable.mutate(req)
          },

          // --- READS (filter out soft-deleted records) ---

          async get(req: any) {
            const result = await downTable.get(req)
            if (_rawAccess || !usesSoftDelete) return result
            return result?.deletedAt ? undefined : result
          },

          async getMany(req: any) {
            const results = await downTable.getMany(req)
            if (_rawAccess || !usesSoftDelete) return results
            return results.map((r: any) => (r?.deletedAt ? undefined : r))
          },

          async query(req: any) {
            const result = await downTable.query(req)
            if (_rawAccess || !usesSoftDelete || !req.values) return result
            const filtered = result.result.filter((r: any) => !r.deletedAt)
            return { ...result, result: filtered }
          },

          async count(req: any) {
            if (_rawAccess || !usesSoftDelete) return downTable.count(req)
            // Count non-deleted records by querying with values
            const result = await downTable.query({
              trans: req.trans,
              query: req.query,
              values: true,
            })
            return result.result.filter((r: any) => !r.deletedAt).length
          },
        }
      },
    }
  },
})

