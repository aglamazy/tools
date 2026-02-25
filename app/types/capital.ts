// Capital Entry - Track investment/pension/savings holdings over time
export interface CapitalEntry {
  id?: number
  syncId?: string           // UUID for cross-device identity
  date: string              // Snapshot date (DD/MM/YYYY)
  assetType: string         // Asset type (flexible - user defined: pension, provident, stocks, etc.)
  institution: string       // Bank/Pension fund/Investment house
  accountNumber?: string    // Account/Policy number
  description: string       // Holding description/name
  amount: number           // Value at this snapshot
  currency: 'ILS' | 'USD' | 'EUR'
  employer?: string        // Employer name (optional) - מעסיק
  investmentTrack?: string // מסלול השקעה - free text (stocks, bonds, mixed, etc.)
  agent?: string           // Agent/broker handling this asset - סוכן
  soldDate?: string        // When sold (DD/MM/YYYY) - null if active
  notes?: string
  importedAt: string       // ISO timestamp
  updatedAt?: string       // ISO timestamp
  deletedAt?: string       // ISO timestamp - soft delete
  fileId?: string          // Reference to imported Excel file
}

// Holding identifier - unique key for a holding
export type HoldingKey = {
  institution: string
  accountNumber: string
  description: string
}

// Portfolio snapshot as of a specific date
export type PortfolioSnapshot = {
  asOfDate: string
  holdings: CapitalEntry[]
  totalsByCurrency: {
    ILS: number
    USD: number
    EUR: number
  }
}

// Historical trend for a specific holding
export type HoldingHistory = {
  holding: HoldingKey
  snapshots: CapitalEntry[]
}
