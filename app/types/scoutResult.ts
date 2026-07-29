export type ScoutResultStatus = 'new' | 'useful' | 'not_useful' | 'apply' | 'not_yet' | 'not_available'

export type ScoutResult = {
  id?: number
  syncId?: string
  businessId: string
  title: string
  url?: string
  source?: string
  summary: string
  deadline?: string
  details?: string
  status: ScoutResultStatus
  foundAt: string
  createdAt: string
  updatedAt: string
}
