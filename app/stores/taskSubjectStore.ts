import { db } from '@/app/db/financeDB'
import type { SubjectData, ApplicationProfile, SubjectType } from '@/app/types/subject'

const SUBJECT_PREFIX = 'taskSubject:'

function subjectKey(name: string): string {
  return `${SUBJECT_PREFIX}${name}`
}

export const taskSubjectStore = {
  async get(name: string): Promise<SubjectData | null> {
    const setting = await db.appSettings.where('key').equals(subjectKey(name)).first()
    return setting ? (setting.value as SubjectData) : null
  },

  async getAll(): Promise<SubjectData[]> {
    const settings = await db.appSettings
      .where('key')
      .startsWith(SUBJECT_PREFIX)
      .toArray()
    return settings.map(s => s.value as SubjectData)
  },

  async save(data: SubjectData): Promise<void> {
    const key = subjectKey(data.name)
    const existing = await db.appSettings.where('key').equals(key).first()
    const value: SubjectData = { ...data, updatedAt: new Date().toISOString() }
    if (existing) {
      await db.appSettings.update(existing.id!, { value, updatedAt: new Date().toISOString() })
    } else {
      await db.appSettings.add({ key, value, updatedAt: new Date().toISOString() })
    }
  },

  async updateType(name: string, type: SubjectType): Promise<void> {
    const data = await taskSubjectStore.get(name)
    if (data) {
      await taskSubjectStore.save({ ...data, type })
    } else {
      await taskSubjectStore.save({ name, type, createdAt: new Date().toISOString() })
    }
  },

  async updateApplication(name: string, profile: ApplicationProfile): Promise<void> {
    const data = await taskSubjectStore.get(name)
    if (data) {
      await taskSubjectStore.save({ ...data, type: 'application', application: profile })
    } else {
      await taskSubjectStore.save({
        name, type: 'application', application: profile, createdAt: new Date().toISOString(),
      })
    }
  },

  async delete(name: string): Promise<void> {
    const key = subjectKey(name)
    const existing = await db.appSettings.where('key').equals(key).first()
    if (existing) {
      await db.appSettings.delete(existing.id!)
    }
  },
}
