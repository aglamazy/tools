// Task-management chat actions (create/list/complete/update/delete), split
// out of actionExecutor.ts to stay under the 850-line eslint cap — this
// domain is fully self-contained (only taskFirestoreService + uid/action),
// no shared state with the grocery/checkout logic that file also handles.
import { listTasks, createTask, updateTask, deleteTask, findTasks } from '@/app/services/taskFirestoreService'
import type { ChatAction } from './chatProcessor'

export const TASK_ACTIONS = new Set(['create_task', 'list_tasks', 'complete_task', 'update_task', 'delete_task'])

export async function handleTaskAction(uid: string, action: ChatAction): Promise<string> {
  switch (action.action) {
    case 'create_task': {
      const title = typeof action.title === 'string' ? action.title.trim() : ''
      if (!title) return 'חסר כותרת למשימה.'
      const task = await createTask(uid, title, {
        priority: typeof action.priority === 'string' ? action.priority as any : undefined,
        quadrant: typeof action.quadrant === 'string' ? action.quadrant as any : undefined,
        deadline: typeof action.deadline === 'string' ? action.deadline : undefined,
      })
      const deadlineStr = task.deadline ? ` (עד ${task.deadline})` : ''
      return `✅ משימה נוצרה: "${task.title}"${deadlineStr}`
    }

    case 'list_tasks': {
      const query = typeof action.query === 'string' ? action.query : ''
      const tasks = query ? await findTasks(uid, query) : await listTasks(uid)
      if (tasks.length === 0) return query ? `לא נמצאו משימות עם "${query}".` : 'אין משימות.'
      const lines = tasks.map(t => {
        const status = t.completed ? '✓' : '○'
        const deadline = t.deadline ? ` — עד ${t.deadline}` : ''
        return `${status} [${t.id.slice(-4)}] ${t.title}${deadline}`
      })
      return `משימות${query ? ` (חיפוש: "${query}")` : ''}:\n${lines.join('\n')}`
    }

    case 'complete_task': {
      const taskId = typeof action.id === 'string' ? action.id : ''
      if (!taskId) return 'חסר מזהה משימה.'
      const tasks = await listTasks(uid)
      const task = tasks.find(t => t.id === taskId || t.id.endsWith(taskId))
      if (!task) return `לא נמצאה משימה עם מזהה "${taskId}".`
      await updateTask(uid, task.id, { completed: true })
      return `✅ משימה סומנה כהושלמה: "${task.title}"`
    }

    case 'update_task': {
      const taskId = typeof action.id === 'string' ? action.id : ''
      if (!taskId) return 'חסר מזהה משימה.'
      const tasks = await listTasks(uid)
      const task = tasks.find(t => t.id === taskId || t.id.endsWith(taskId))
      if (!task) return `לא נמצאה משימה עם מזהה "${taskId}".`
      const updates: Record<string, unknown> = {}
      if (typeof action.title === 'string') updates.title = action.title.trim()
      if (typeof action.deadline === 'string') updates.deadline = action.deadline
      if (typeof action.priority === 'string') updates.priority = action.priority
      if (typeof action.quadrant === 'string') updates.quadrant = action.quadrant
      if (typeof action.completed === 'boolean') updates.completed = action.completed
      await updateTask(uid, task.id, updates as any)
      return `✏️ משימה עודכנה: "${task.title}"`
    }

    case 'delete_task': {
      const taskId = typeof action.id === 'string' ? action.id : ''
      if (!taskId) return 'חסר מזהה משימה.'
      const tasks = await listTasks(uid)
      const task = tasks.find(t => t.id === taskId || t.id.endsWith(taskId))
      if (!task) return `לא נמצאה משימה עם מזהה "${taskId}".`
      await deleteTask(uid, task.id)
      return `🗑️ משימה נמחקה: "${task.title}"`
    }

    default:
      throw new Error(`handleTaskAction called with non-task action: ${action.action}`) // unreachable — TASK_ACTIONS gates the call site
  }
}
