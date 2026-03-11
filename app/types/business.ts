export enum BusinessType {
  Personal = 'personal',
  Business = 'business',
  Teacher = 'teacher',
  Artist = 'artist',
}

// Database entity (id optional for new records)
export type VatType = 'exempt' | 'authorized'

export type Business = {
  id?: number
  name: string
  type: BusinessType
  vatType?: VatType
  isTaxFree?: boolean
  btlAdvancePayment?: number
  marginalTaxRate?: number // מס שולי — starting tax bracket % for people with additional income
  userId?: string
  pinnedToSidebar?: boolean
  createdAt: string
  updatedAt: string
}

// UI type (id always present for display/edit)
export type BusinessUI = Omit<Business, 'id' | 'createdAt' | 'updatedAt'> & {
  id: number
}
