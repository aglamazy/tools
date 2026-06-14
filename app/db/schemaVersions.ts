import type Dexie from 'dexie'

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
}
