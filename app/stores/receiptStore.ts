import { db } from '@/app/db/financeDB'
import type { Receipt } from '@/app/types/receipt'

export const receiptStore = {
  getAll: async (): Promise<Receipt[]> => {
    try {
      return await db.receipts.toArray()
    } catch (error) {
      console.error('Error getting receipts:', error)
      return []
    }
  },

  getByBusinessId: async (businessId: number): Promise<Receipt[]> => {
    try {
      return await db.receipts.where('businessId').equals(businessId).toArray()
    } catch (error) {
      console.error('Error getting receipts by business id:', error)
      return []
    }
  },

  getByStudentId: async (studentId: number): Promise<Receipt[]> => {
    try {
      return await db.receipts.where('studentId').equals(studentId).toArray()
    } catch (error) {
      console.error('Error getting receipts by student id:', error)
      return []
    }
  },

  getLastByStudentId: async (studentId: number): Promise<Receipt | undefined> => {
    try {
      const receipts = await db.receipts
        .where('studentId')
        .equals(studentId)
        .toArray()
      if (receipts.length === 0) return undefined
      return receipts.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0]
    } catch (error) {
      console.error('Error getting last receipt for student:', error)
      return undefined
    }
  },

  getNextReceiptNumber: async (businessId: number): Promise<number> => {
    try {
      const receipts = await db.receipts
        .where('businessId')
        .equals(businessId)
        .toArray()
      if (receipts.length === 0) return 1
      const maxNum = Math.max(...receipts.map(r => r.receiptNumber))
      return maxNum + 1
    } catch (error) {
      console.error('Error getting next receipt number:', error)
      return 1
    }
  },

  add: async (receipt: Omit<Receipt, 'id' | 'createdAt' | 'updatedAt'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.receipts.add({
        ...receipt,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding receipt:', error)
      return null
    }
  },

  delete: async (id: number): Promise<boolean> => {
    try {
      await db.receipts.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting receipt:', error)
      return false
    }
  },

  export: async (): Promise<Receipt[]> => {
    try {
      return await db.receipts.toArray()
    } catch (error) {
      console.error('Error exporting receipts:', error)
      return []
    }
  },

  import: async (receipts: Receipt[]): Promise<boolean> => {
    try {
      await db.receipts.clear()
      await db.receipts.bulkAdd(receipts.map(r => ({
        ...r,
        id: undefined,
      })))
      return true
    } catch (error) {
      console.error('Error importing receipts:', error)
      return false
    }
  },
}
