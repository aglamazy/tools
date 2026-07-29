// Harvest Task Store - Uses IndexedDB via Dexie

import { db, HarvestTask } from '@/app/db/financeDB'

export const harvestTaskStore = {
  /**
   * Get all tasks
   */
  getAll: async (): Promise<HarvestTask[]> => {
    try {
      return await db.harvestTasks.toArray()
    } catch (error) {
      console.error('Error getting harvest tasks:', error)
      return []
    }
  },

  /**
   * Get tasks by project syncId
   */
  getByProjectId: async (projectId: string): Promise<HarvestTask[]> => {
    try {
      return await db.harvestTasks.where('projectId').equals(projectId).toArray()
    } catch (error) {
      console.error('Error getting tasks by project id:', error)
      return []
    }
  },

  /**
   * Get active (non-archived) tasks by project syncId
   */
  getActiveByProjectId: async (projectId: string): Promise<HarvestTask[]> => {
    try {
      return await db.harvestTasks
        .where('projectId')
        .equals(projectId)
        .filter(t => !t.archived)
        .toArray()
    } catch (error) {
      console.error('Error getting active tasks:', error)
      return []
    }
  },

  /**
   * Get task by id
   */
  getById: async (id: number): Promise<HarvestTask | undefined> => {
    try {
      return await db.harvestTasks.get(id)
    } catch (error) {
      console.error('Error getting task by id:', error)
      return undefined
    }
  },

  /**
   * Get task by syncId — needed wherever a task is referenced by FK (e.g.
   * TimeEntry.taskId) rather than by local primary key.
   */
  getBySyncId: async (syncId: string): Promise<HarvestTask | undefined> => {
    try {
      return await db.harvestTasks.where('syncId').equals(syncId).first()
    } catch (error) {
      console.error('Error getting task by syncId:', error)
      return undefined
    }
  },

  /**
   * Add a new task
   */
  add: async (task: Omit<HarvestTask, 'id' | 'createdAt' | 'updatedAt' | 'archived'>): Promise<number | null> => {
    try {
      const now = new Date().toISOString()
      const id = await db.harvestTasks.add({
        ...task,
        archived: false,
        createdAt: now,
        updatedAt: now,
      })
      return id
    } catch (error) {
      console.error('Error adding task:', error)
      return null
    }
  },

  /**
   * Update an existing task
   */
  update: async (id: number, updates: Partial<Omit<HarvestTask, 'id' | 'createdAt'>>): Promise<boolean> => {
    try {
      await db.harvestTasks.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error updating task:', error)
      return false
    }
  },

  /**
   * Archive a task
   */
  archive: async (id: number): Promise<boolean> => {
    try {
      await db.harvestTasks.update(id, {
        archived: true,
        updatedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      console.error('Error archiving task:', error)
      return false
    }
  },

  /**
   * Delete a task and all its time entries
   */
  delete: async (id: number): Promise<boolean> => {
    try {
      const task = await db.harvestTasks.get(id)
      if (task?.syncId) {
        // timeEntries.taskId holds the task's syncId, not its local id
        await db.timeEntries.where('taskId').equals(task.syncId).delete()
      }

      // Delete the task
      await db.harvestTasks.delete(id)
      return true
    } catch (error) {
      console.error('Error deleting task:', error)
      return false
    }
  },

  /**
   * Export all tasks for backup
   */
  export: async (): Promise<HarvestTask[]> => {
    try {
      return await db.harvestTasks.toArray()
    } catch (error) {
      console.error('Error exporting tasks:', error)
      return []
    }
  },

  /**
   * Import tasks from backup
   */
  import: async (tasks: HarvestTask[]): Promise<boolean> => {
    try {
      await db.harvestTasks.clear()
      await db.harvestTasks.bulkAdd(tasks.map(t => ({
        ...t,
        id: undefined,
      })))
      return true
    } catch (error) {
      console.error('Error importing tasks:', error)
      return false
    }
  },
}
