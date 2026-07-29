export enum BusinessType {
  Personal = 'personal',
  Business = 'business',
  Employee = 'employee',
  Teacher = 'teacher',
  Artist = 'artist',
}

// Database entity (id optional for new records)
export type VatType = 'exempt' | 'authorized'

export type Business = {
  id?: number
  slug?: string
  name: string
  type: BusinessType
  vatType?: VatType
  isTaxFree?: boolean
  btlAdvancePayment?: number
  incomeTaxAdvancePercent?: number // מקדמות מס הכנסה — % מההכנסה החודשית
  incomeTaxAdvancePeriod?: 1 | 2 // תקופת תשלום מקדמות — 1=חודשי, 2=דו-חודשי
  taxOrder?: number // סדר לחישוב מס — 1=ראשון (מדרגות נמוכות), 2=שני, וכו׳
  userId?: string
  pinnedToSidebar?: boolean
  sharedWithMe?: boolean
  createdAt: string
  updatedAt: string
}

// UI type (id always present for display/edit)
export type BusinessUI = Omit<Business, 'id' | 'createdAt' | 'updatedAt'> & {
  id: number
}
