import { db, Vacation } from '@/app/db/financeDB'

export const vacationStore = {
  async add(vacation: Omit<Vacation, 'id' | 'createdAt'>): Promise<Vacation> {
    const entry: Omit<Vacation, 'id'> = {
      ...vacation,
      createdAt: new Date().toISOString(),
    }
    const id = await db.vacations.add(entry)
    return { ...entry, id }
  },

  async getAll(): Promise<Vacation[]> {
    return db.vacations.orderBy('createdAt').reverse().toArray()
  },

  async update(id: number, updates: Partial<Omit<Vacation, 'id' | 'createdAt'>>): Promise<void> {
    await db.vacations.update(id, updates)
  },

  async delete(id: number): Promise<void> {
    await db.vacations.delete(id)
  },
}
