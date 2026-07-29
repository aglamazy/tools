import type Dexie from 'dexie'
import { generateUniqueSlug } from '@/app/utils/businessSlug'
import { remapLegacyFks, FK_FIELDS_TO_MIGRATE, type OrphanOverride } from '@/app/services/migrations/remapLegacyFks'

export function defineSchemaVersions(db: Dexie): void {
  db.version(1).stores({
    // Transactions table with compound indexes
    transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',

    // Imported files
    importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',

    // Categories
    categories: '++id, name, type',
  })

  db.version(2).stores({
    transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, name, type',
    businessCategories: '++id, &business',
  })

  db.version(3).stores({
    transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, name, type',
    businessCategories: '++id, &business',
    tasks: '++id, createdAt, priority',
  })

  db.version(4).stores({
    transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, name, type',
    businessCategories: '++id, &business',
    tasks: '++id, createdAt, priority',
    appSettings: '++id, &key',
  })

  db.version(5).stores({
    transactions: '++id, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, name, type',
    businessCategories: '++id, &business',
    tasks: '++id, createdAt, priority',
    appSettings: '++id, &key',
    businesses: '++id, &name, type',
  })

  db.version(6).stores({
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

  db.version(7).stores({
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

  db.version(8).stores({
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

  db.version(9).stores({
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

  db.version(10).stores({
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

  db.version(11).stores({
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

  db.version(12).stores({
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

  db.version(13).stores({
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

  db.version(14).stores({
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

  db.version(15).stores({
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

  db.version(16).stores({
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
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, month, year, [businessId+year]',
  })

  db.version(17).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
  })

  db.version(18).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
  }).upgrade(async (trans) => {
    // Migrate existing tasks: set default quadrant based on priority
    const tasks = await trans.table('tasks').toArray()
    for (const task of tasks) {
      const updates: Record<string, any> = {}
      if (!task.quadrant) {
        // Map old priority to quadrant
        if (task.priority === 'high') updates.quadrant = 'do'
        else if (task.priority === 'medium') updates.quadrant = 'schedule'
        else updates.quadrant = 'eliminate'
      }
      if (!task.deadline) {
        // Default deadline: 10th of current month
        const now = new Date()
        const deadline = new Date(now.getFullYear(), now.getMonth(), 10)
        if (deadline < now) {
          deadline.setMonth(deadline.getMonth() + 1)
        }
        updates.deadline = deadline.toISOString()
      }
      if (Object.keys(updates).length > 0) {
        await trans.table('tasks').update(task.id, updates)
      }
    }
  })

  db.version(19).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
  }).upgrade(async (trans) => {
    const txns = await trans.table('transactions').toArray()
    for (const t of txns) {
      // Fix month: convert MM.YY to MM/YYYY
      const dotMatch = t.month?.match(/^(\d{2})\.(\d{2})$/)
      if (dotMatch) {
        await trans.table('transactions').update(t.id, {
          month: `${dotMatch[1]}/20${dotMatch[2]}`,
        })
      }
    }
  })

  db.version(20).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType',
  })

  db.version(21).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
  })

  db.version(22).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
  })

  db.version(23).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
    advancePayments: '++id, syncId, businessId, month, type, [businessId+month+type]',
  })

  db.version(24).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId, botId',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
    advancePayments: '++id, syncId, businessId, month, type, [businessId+month+type]',
  })

  db.version(25).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId, botId, taskType, subject',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
    advancePayments: '++id, syncId, businessId, month, type, [businessId+month+type]',
  })

  // v26: add multi-thread chat persistence (chats + chatMessages).
  // Replaces the old single-thread localStorage key (aglamazo_chat_history_v1_{uid}),
  // which chatHistoryStore.migrateFromLocalStorageV1() imports lazily on first load.
  db.version(26).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId, botId, taskType, subject',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
    advancePayments: '++id, syncId, businessId, month, type, [businessId+month+type]',
    chats: '&id, syncId, uid, updatedAt, [uid+updatedAt]',
    chatMessages: '&id, syncId, chatId, uid, createdAt, [chatId+createdAt]',
  })

  // v27: add credentials table — encrypted external-service logins (BTL, banks…).
  // userCode/password fields hold AES-256-GCM ciphertext keyed off the cloud-sync password.
  db.version(27).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId, botId, taskType, subject',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
    advancePayments: '++id, syncId, businessId, month, type, [businessId+month+type]',
    chats: '&id, syncId, uid, updatedAt, [uid+updatedAt]',
    chatMessages: '&id, syncId, chatId, uid, createdAt, [chatId+createdAt]',
    credentials: '++id, syncId, &service',
  })

  // v28: vatPayments table + vatPaymentId index on the doc tables it tags.
  // Untagged docs surface in the open period; tagged docs disappear into
  // their paid period. Late-arriving past-period invoices automatically
  // land in the next open period (since they were never tagged).
  db.version(28).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId, botId, taskType, subject',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType, vatPaymentId',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType, vatPaymentId',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
    advancePayments: '++id, syncId, businessId, month, type, [businessId+month+type]',
    chats: '&id, syncId, uid, updatedAt, [uid+updatedAt]',
    chatMessages: '&id, syncId, chatId, uid, createdAt, [chatId+createdAt]',
    credentials: '++id, syncId, &service',
    vatPayments: '++id, syncId, userId, periodStart, periodEnd, paymentDate',
  })

  // v29: blogPosts — Markdown-sourced blog post editor (FamCircle).
  // Content is stored as raw Markdown; HTML is rendered client-side.
  db.version(29).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId, botId, taskType, subject',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType, vatPaymentId',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType, vatPaymentId',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
    advancePayments: '++id, syncId, businessId, month, type, [businessId+month+type]',
    chats: '&id, syncId, uid, updatedAt, [uid+updatedAt]',
    chatMessages: '&id, syncId, chatId, uid, createdAt, [chatId+createdAt]',
    credentials: '++id, syncId, &service',
    vatPayments: '++id, syncId, userId, periodStart, periodEnd, paymentDate',
    blogPosts: '++id, syncId, &slug, status, createdAt',
  })

  // v30: drop blogPosts — Aglamazo has no blog (aglamaz.com/FamCircle owns it).
  // blogPosts: null is the Dexie-correct way to remove a table while preserving
  // earlier version history (do NOT edit v29).
  db.version(30).stores({
    blogPosts: null,
  })

  // v31: suppliers — canonical vendor entity replacing loose name-string
  // matching. bankCardAliases/emailSenders are multi-entry indexes so a raw
  // transaction description or email sender can be resolved to a supplier
  // with a single indexed lookup instead of scanning every row.
  db.version(31).stores({
    transactions: '++id, syncId, type, month, accountNumber, cardNumber, date, chargingDate, [type+month], [cardNumber+month], [accountNumber+month], fileId',
    importedFiles: '++id, syncId, fileName, fileType, processingMonth, [fileType+processingMonth], [cardNumber+processingMonth]',
    categories: '++id, syncId, name, type',
    businessCategories: '++id, syncId, &business',
    tasks: '++id, syncId, createdAt, priority, quadrant, deadline, delegatedTo, autoTaskId, botId, taskType, subject',
    appSettings: '++id, syncId, &key',
    businesses: '++id, syncId, &name, type, userId',
    projects: '++id, syncId, businessId, name, archived',
    harvestTasks: '++id, syncId, projectId, name, archived',
    timeEntries: '++id, syncId, taskId, date, startTime, endTime, [taskId+date]',
    capitalEntries: '++id, syncId, date, institution, accountNumber, description, assetType, currency, employer, investmentTrack, agent, soldDate, [institution+accountNumber+description], fileId',
    financialInstitutions: '++id, syncId, name, type',
    ypayDocuments: '++id, syncId, &transactionId, docType, vatPaymentId',
    students: '++id, syncId, businessId, name, archived',
    profileQAs: '++id, syncId, businessId, [businessId+answerType]',
    scoutResults: '++id, syncId, businessId, status, [businessId+status]',
    scoutConfigs: '++id, syncId, &businessId',
    taxDocuments: '++id, syncId, businessId, userId, month, year, [businessId+year]',
    expenseDocuments: '++id, syncId, transactionId, date, vendor, category, sourceType, vatPaymentId',
    businessTasks: '++id, syncId, businessId, recurrence, archived',
    advancePayments: '++id, syncId, businessId, month, type, [businessId+month+type]',
    chats: '&id, syncId, uid, updatedAt, [uid+updatedAt]',
    chatMessages: '&id, syncId, chatId, uid, createdAt, [chatId+createdAt]',
    credentials: '++id, syncId, &service',
    vatPayments: '++id, syncId, userId, periodStart, periodEnd, paymentDate',
    suppliers: '++id, syncId, businessId, name, categoryId, *bankCardAliases, *emailSenders',
  })

  // Replaces the localStorage-backed subjectStore (categories + per-transaction
  // classifications) with real Dexie synced tables — see Subject/SubjectClassification
  // in financeDB.ts for the "why" (2026-07-11 whole-blob-overwrite wipe incident).
  // `subjects.id` keeps subjectStore's existing string id scheme as the Dexie
  // primary key (not a new auto-increment surrogate), so every existing
  // reference (businessCategories, transaction linkage, parent/subCategory
  // trees) keeps working unchanged. `subjectClassifications.transactionId` is
  // its primary key, matching the one-classification-per-transaction invariant
  // the old array-based store already enforced.
  db.version(32).stores({
    subjects: 'id, syncId, name, type, businessId, [businessId+type]',
    // ++id (not transactionId) — the generic cross-device merge machinery
    // (applyMergedBackupService.ts) requires every synced table's primary key
    // to be named `id`; transactionId is a device-local auto-increment FK
    // into `transactions` (remapped per-device via FK_RELATIONS) so it can't
    // double as the primary key. &transactionId enforces the one-
    // classification-per-transaction invariant as a proper unique index
    // instead, which getUniqueKeyTables() picks up automatically for dedup.
    subjectClassifications: '++id, syncId, &transactionId, categoryId, monthYear, [categoryId+monthYear]',
  })

  // Short, unique, human-readable business identifier for URLs
  // (/app/business/AH instead of /app/business/11) — the numeric id is a
  // mutable Dexie auto-increment and is exactly as fragile for bookmarks/
  // links as it was for the FK fields fixed in v34; a slug never changes
  // once assigned.
  db.version(33).stores({
    businesses: '++id, syncId, &name, &slug, type, userId',
  }).upgrade(async (trans) => {
    const table = trans.table('businesses')
    const all = await table.toArray()
    const used = new Set<string>(all.map((b) => b.slug).filter(Boolean))
    for (const biz of all) {
      if (biz.slug) continue
      try {
        const slug = generateUniqueSlug(biz.name, used)
        used.add(slug)
        await table.update(biz.id, { slug })
      } catch (err) {
        // Never let one bad row abort the whole versionchange transaction —
        // that would pin the DB at the old version until a new build ships.
        console.warn(`[Migration v33] Failed to generate slug for business ${biz.id}:`, err)
      }
    }
  })

  // v34: convert every FK field that stores a local Dexie auto-increment int
  // into one holding the referenced row's syncId instead — see
  // remapLegacyFks.ts for the full "why" (root-caused 2026-07-28: a business
  // got recreated under 3 different local ids during a sync-bug incident,
  // and everything that referenced it by that mutable int silently orphaned
  // or misattributed). An indexed field works the same in Dexie whether it
  // holds a number or a string, so no .stores() index-shape change is
  // needed here — this version is a pure data transform.
  db.version(34).upgrade(async (trans) => {
    const tableNames = new Set<string>(['ypayDocuments', 'transactions'])
    for (const spec of FK_FIELDS_TO_MIGRATE) {
      tableNames.add(spec.childTable)
      tableNames.add(spec.parentTable)
    }

    const stores: Record<string, any[]> = {}
    for (const name of tableNames) {
      stores[name] = await trans.table(name).toArray()
    }

    // No bundled one-time overrides: validated against Agla's real cloud
    // export (2026-07-28) via findUnresolvedFks — every FK field in
    // FK_FIELDS_TO_MIGRATE resolves cleanly against the real `businesses`
    // table with zero genuine orphans. An earlier version of this migration
    // guessed AH had cycled through dead ids 5/9/10 and bundled a hardcoded
    // override for them — that guess was wrong (id 5 was AH's own live id in
    // the real data, not a dead incarnation) and came from stale forensics
    // on a locally-mangled dev copy, not the real data. Lesson: use
    // findUnresolvedFks against a real export to find genuine orphans, never
    // hand-guess. If a real device surfaces a genuine unresolved FK, it logs
    // a warning below and clears to undefined rather than silently
    // misattributing to the wrong business.
    const orphanOverrides: OrphanOverride[] = []

    const { stores: remapped, warnings } = remapLegacyFks(stores, orphanOverrides)
    if (warnings.length > 0) {
      console.warn(`[Migration v34] ${warnings.length} warning(s):\n${warnings.join('\n')}`)
    }

    // Group all migrated fields per table so each row gets one update() call.
    const fieldsByTable = new Map<string, Set<string>>()
    for (const spec of FK_FIELDS_TO_MIGRATE) {
      if (!fieldsByTable.has(spec.childTable)) fieldsByTable.set(spec.childTable, new Set())
      fieldsByTable.get(spec.childTable)!.add(spec.field)
    }
    if (!fieldsByTable.has('ypayDocuments')) fieldsByTable.set('ypayDocuments', new Set())
    fieldsByTable.get('ypayDocuments')!.add('transactionId')
    fieldsByTable.get('ypayDocuments')!.add('closesAllocations')

    for (const [tableName, fields] of fieldsByTable) {
      const table = trans.table(tableName)
      for (const row of remapped[tableName] || []) {
        const updates: Record<string, any> = {}
        for (const f of fields) updates[f] = row[f]
        try {
          await table.update(row.id, updates)
        } catch (err) {
          // Same rule as v33: never let one bad row abort the whole
          // versionchange transaction.
          console.warn(`[Migration v34] Failed to update ${tableName} row ${row.id}:`, err)
        }
      }
    }
  })

  // v35: drop the UNIQUE constraint on businesses.slug (&slug -> slug).
  //
  // v33 introduced `&slug` for correctness, but a unique index on a SYNCED
  // table is a merge-abort hazard: slugs are derived from name initials
  // per-device, so two genuinely different businesses on two devices can
  // independently produce the same slug ("Alpha House" and "Agents Head"
  // both -> AH). When they meet, the insert throws ConstraintError and
  // aborts the ENTIRE merge transaction — losing every other table's
  // changes in that run, for a cosmetic URL field. That's the same
  // class of failure that made the 2026-07-28 incident so damaging.
  //
  // The merge loop also can't dedup on it: getUniqueKeyTables() supports one
  // unique index per table and correctly picks `name` (the real identity),
  // logging "businesses has 2 secondary unique indexes" — so `slug` was
  // enforced but unguarded, the worst combination.
  //
  // Uniqueness is now an application-layer concern, where a collision is
  // resolvable instead of fatal: businessStore.add() suffixes on create, and
  // applyCloudBackup re-suffixes an incoming slug that would collide.
  db.version(35).stores({
    businesses: '++id, syncId, &name, slug, type, userId',
  })
}
