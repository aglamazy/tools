export type Student = {
  id?: number
  syncId?: string
  businessId: string       // FK to Business.syncId (teacher)
  name: string             // e.g. "משה לוי"
  email?: string           // the paying customer — REQUIRED before an invoice is issued (siblings share one)
  contactBusinessID?: string  // ח.פ — YPAY contact, mirrors Project.contactBusinessID
  contactPhone?: string       // YPAY contact phone, mirrors Project.contactPhone
  lessonRate: number       // price per lesson
  archived: boolean
  createdAt: string
  updatedAt: string
}
