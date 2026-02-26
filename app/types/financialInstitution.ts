// Financial Institution - Banks, pension funds, investment houses, etc.
export interface FinancialInstitution {
  id?: number
  syncId?: string
  name: string
  type: 'bank' | 'pension' | 'provident' | 'investment' | 'insurance' | 'other'
  email?: string
  phone?: string
  website?: string
  contactPerson?: string
  address?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type FinancialInstitutionType = FinancialInstitution['type']

// Display labels for institution types (Hebrew)
export const institutionTypeLabels: Record<FinancialInstitutionType, string> = {
  bank: 'בנק',
  pension: 'קרן פנסיה',
  provident: 'קרן השתלמות/גמל',
  investment: 'בית השקעות',
  insurance: 'ביטוח',
  other: 'אחר',
}
