export type BusinessType = 'personal' | 'business'

// Database entity (id optional for new records)
export type Business = {
  id?: number
  name: string
  type: BusinessType
  driveFolderId?: string
  driveFolderName?: string
  createdAt: string
  updatedAt: string
}

// UI type (id always present for display/edit)
export type BusinessUI = Omit<Business, 'id' | 'createdAt' | 'updatedAt'> & {
  id: number
}
