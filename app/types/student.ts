export type Student = {
  id?: number
  syncId?: string
  businessId: number       // FK to Business (teacher)
  name: string             // e.g. "משה לוי"
  email?: string
  lessonRate: number       // price per lesson
  archived: boolean
  createdAt: string
  updatedAt: string
}
