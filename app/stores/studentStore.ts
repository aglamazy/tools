import { db, Student } from '@/app/db/financeDB'

export const studentStore = {
  getAll: async (): Promise<Student[]> => {
    try {
      return await db.students.toArray()
    } catch (error) {
      console.error('Error getting students:', error)
      return []
    }
  },

  getByBusinessId: async (businessId: number): Promise<Student[]> => {
    try {
      return await db.students.where('businessId').equals(businessId).toArray()
    } catch (error) {
      console.error('Error getting students by business id:', error)
      return []
    }
  },

  getActiveByBusinessId: async (businessId: number): Promise<Student[]> => {
    try {
      return await db.students
        .where('businessId')
        .equals(businessId)
        .filter(s => !s.archived)
        .toArray()
    } catch (error) {
      console.error('Error getting active students:', error)
      return []
    }
  },

  getById: async (id: number): Promise<Student | undefined> => {
    try {
      return await db.students.get(id)
    } catch (error) {
      console.error('Error getting student by id:', error)
      return undefined
    }
  },

  add: async (student: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'archived'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.students.add({
        ...student,
        archived: false,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding student:', error)
      return null
    }
  },

  update: async (id: number, updates: Partial<Omit<Student, 'id' | 'createdAt'>>): Promise<boolean> => {
    try {
      await db.students.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating student:', error)
      return false
    }
  },

  archive: async (id: number): Promise<boolean> => {
    try {
      await db.students.update(id, {
        archived: true,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error archiving student:', error)
      return false
    }
  },

  delete: async (id: number): Promise<boolean> => {
    try {
      await db.students.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting student:', error)
      return false
    }
  },

  findByName: async (businessId: number, name: string): Promise<Student | undefined> => {
    try {
      const students = await db.students
        .where('businessId')
        .equals(businessId)
        .toArray()
      const normalizedName = name.trim().toLowerCase()
      return students.find(s =>
        s.name.trim().toLowerCase().includes(normalizedName) ||
        normalizedName.includes(s.name.trim().toLowerCase())
      )
    } catch (error) {
      console.error('Error finding student by name:', error)
      return undefined
    }
  },

  export: async (): Promise<Student[]> => {
    try {
      return await db.students.toArray()
    } catch (error) {
      console.error('Error exporting students:', error)
      return []
    }
  },

  import: async (students: Student[]): Promise<boolean> => {
    try {
      await db.students.clear()
      await db.students.bulkAdd(students.map(s => ({
        ...s,
        id: undefined,
      })))
      return true
    } catch (error) {
      console.error('Error importing students:', error)
      return false
    }
  },
}
