export type Receipt = {
  id?: number
  syncId?: string
  businessId: number
  studentId: number
  receiptNumber: number
  periodStart: string
  periodEnd: string
  lessonCount: number
  lessonRate: number
  totalAmount: number
  createdAt: string
  updatedAt: string
}
