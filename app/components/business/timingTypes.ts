import type { TimeEntry } from '@/app/db/financeDB'

export type WeekEntry = TimeEntry & {
  projectName: string
  taskName: string
  projectColor: string
}

export type ProjectSummary = {
  projectName: string
  totalHours: number
}

export type ViewMode = 'daily' | 'weekly' | 'monthly' | 'recent'

export const VIEW_MODES: ViewMode[] = ['daily', 'weekly', 'monthly', 'recent']

export function calculateProjectSummaries(entries: WeekEntry[]): ProjectSummary[] {
  const projectMap = new Map<string, number>()

  entries.forEach(entry => {
    const current = projectMap.get(entry.projectName) || 0
    projectMap.set(entry.projectName, current + entry.hours)
  })

  return Array.from(projectMap.entries())
    .map(([projectName, totalHours]) => ({ projectName, totalHours }))
    .sort((a, b) => b.totalHours - a.totalHours)
}
