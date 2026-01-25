export type BusinessType = 'personal' | 'business'

// Database entity (id optional for new records)
export type VatType = 'exempt' | 'authorized'

export type Business = {
  id?: number
  name: string
  type: BusinessType
  vatType?: VatType
  pinnedToSidebar?: boolean
  createdAt: string
  updatedAt: string
}

// UI type (id always present for display/edit)
export type BusinessUI = Omit<Business, 'id' | 'createdAt' | 'updatedAt'> & {
  id: number
  pinnedToSidebar?: boolean
}
