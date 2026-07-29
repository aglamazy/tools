export type Student = {
  id?: number
  syncId?: string
  businessId: string       // FK to Business.syncId (teacher)
  name: string             // e.g. "משה לוי"
  email?: string
  lessonRate: number       // price per lesson
  archived: boolean
  createdAt: string
  updatedAt: string
}
