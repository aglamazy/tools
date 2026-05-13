export type CredentialService = 'btl' | 'otsar' | 'shufersal' | 'other'

export const CREDENTIAL_SERVICE_LABELS: Record<CredentialService, string> = {
  btl: 'ביטוח לאומי',
  otsar: 'בנק אוצר החייל',
  shufersal: 'שופרסל',
  other: 'אחר',
}

export interface CredentialRow {
  id?: number
  syncId?: string
  service: CredentialService
  serviceName?: string
  userCode: string
  password: string
  notes?: string
  updatedAt?: string
}
