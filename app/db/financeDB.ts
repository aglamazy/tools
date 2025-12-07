import Dexie, { Table } from 'dexie'

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

class FinanceDB extends Dexie {
  transactions!: Table<Transaction, number>
  importedFiles!: Table<ImportedFile, number>
  categories!: Table<Category, number>
  businessCategories!: Table<BusinessCategory, number>
  tasks!: Table<Task, number>

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
  }
}

// Export singleton instance
export const db = new FinanceDB()
