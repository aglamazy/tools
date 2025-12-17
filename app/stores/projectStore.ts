// Project Store - Uses IndexedDB via Dexie

import { db, Project } from '@/app/db/financeDB'

export const projectStore = {
  /**
   * Get all projects
   */
  getAll: async (): Promise<Project[]> => {
    try {
      return await db.projects.toArray()
    } catch (error) {
      console.error('Error getting projects:', error)
      return []
    }
  },

  /**
   * Get projects by business id
   */
  getByBusinessId: async (businessId: number): Promise<Project[]> => {
    try {
      return await db.projects.where('businessId').equals(businessId).toArray()
    } catch (error) {
      console.error('Error getting projects by business id:', error)
      return []
    }
  },

  /**
   * Get active (non-archived) projects by business id
   */
  getActiveByBusinessId: async (businessId: number): Promise<Project[]> => {
    try {
      return await db.projects
        .where('businessId')
        .equals(businessId)
        .filter(p => !p.archived)
        .toArray()
    } catch (error) {
      console.error('Error getting active projects:', error)
      return []
    }
  },

  /**
   * Get project by id
   */
  getById: async (id: number): Promise<Project | undefined> => {
    try {
      return await db.projects.get(id)
    } catch (error) {
      console.error('Error getting project by id:', error)
      return undefined
    }
  },

  /**
   * Add a new project
   */
  add: async (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'archived'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.projects.add({
        ...project,
        archived: false,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding project:', error)
      return null
    }
  },

  /**
   * Update an existing project
   */
  update: async (id: number, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<boolean> => {
    try {
      await db.projects.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating project:', error)
      return false
    }
  },

  /**
   * Archive a project
   */
  archive: async (id: number): Promise<boolean> => {
    try {
      await db.projects.update(id, {
        archived: true,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error archiving project:', error)
      return false
    }
  },

  /**
   * Delete a project and all its tasks and time entries
   */
  delete: async (id: number): Promise<boolean> => {
    try {
      // Get all tasks for this project
      const tasks = await db.harvestTasks.where('projectId').equals(id).toArray()
      const taskIds = tasks.map(t => t.id!).filter(Boolean)

      // Delete all time entries for these tasks
      if (taskIds.length > 0) {
        await db.timeEntries.where('taskId').anyOf(taskIds).delete()
      }

      // Delete all tasks
      await db.harvestTasks.where('projectId').equals(id).delete()

      // Delete the project
      await db.projects.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting project:', error)
      return false
    }
  },

  /**
   * Export all projects for backup
   */
  export: async (): Promise<Project[]> => {
    try {
      return await db.projects.toArray()
    } catch (error) {
      console.error('Error exporting projects:', error)
      return []
    }
  },

  /**
   * Import projects from backup
   */
  import: async (projects: Project[]): Promise<boolean> => {
    try {
      await db.projects.clear()
      await db.projects.bulkAdd(projects.map(p => ({
        ...p,
        id: undefined,
      })))
      return true
    } catch (error) {
      console.error('Error importing projects:', error)
      return false
    }
  },
}
