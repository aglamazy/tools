// App Settings Store - Uses IndexedDB via Dexie

import { db, AppSettings } from '@/app/db/financeDB'
import { config } from '@/app/config'

export interface CardTypeIndicatorsSettings {
  indicators: string[]
}

export type AccountOwners = Record<string, string> // key = "card:1234" or "bank:5678", value = Firebase UID

// Self-employed (עצמאי) Below-The-Line deduction limits per year
export interface SelfEmployedBTLLimits {
  // ביטוח לאומי – reduced rate (%) below threshold
  nationalInsuranceReducedRate: number
  // ביטוח לאומי – full rate (%) above threshold
  nationalInsuranceFullRate: number
  // סף הכנסה לביטוח לאומי (חודשי)
  nationalInsuranceThreshold: number
  // ביטוח בריאות – reduced rate (%) below threshold
  healthInsuranceReducedRate: number
  // ביטוח בריאות – full rate (%) above threshold
  healthInsuranceFullRate: number
  // סף הכנסה לביטוח בריאות (חודשי) – usually same as national insurance
  healthInsuranceThreshold: number
  // הפרשה לפנסיה – אחוז מוכר כהוצאה
  pensionRate: number
  // תקרת הכנסה חודשית לפנסיה
  pensionCeiling: number
  // הפרשה לקרן השתלמות – אחוז מוכר
  educationFundRate: number
  // תקרת הכנסה חודשית לקרן השתלמות
  educationFundCeiling: number
}

export interface DriveSyncSettings {
  frequencyMinutes: number
  lastSyncAt?: string
  lastSyncError?: string
  syncFolderName?: string
  remoteModifiedAt?: string
  standaloneMode?: boolean
}

const DEFAULT_CARD_INDICATORS: CardTypeIndicatorsSettings = {
  indicators: ['ישראכרט', 'פרימיום אקספרס'],
}

const DEFAULT_DRIVE_SYNC_SETTINGS: DriveSyncSettings = {
  frequencyMinutes: config.syncIntervalMinutes,
  standaloneMode: undefined,
}

export const appSettingsStore = {
  /**
   * Get card type indicators
   */
  getCardTypeIndicators: async (): Promise<string[]> => {
    try {
      const setting = await db.appSettings.where('key').equals('cardTypeIndicators').first()
      if (setting) {
        return (setting.value as CardTypeIndicatorsSettings).indicators
      }
      // Initialize if not exists
      await db.appSettings.add({
        key: 'cardTypeIndicators',
        value: DEFAULT_CARD_INDICATORS,
        updatedAt: new Date().toISOString(),
      })
      return DEFAULT_CARD_INDICATORS.indicators
    } catch (error) {
      console.error('Error getting cardTypeIndicators:', error)
      throw error
    }
  },

  /**
   * Set card type indicators
   */
  setCardTypeIndicators: async (indicators: string[]): Promise<void> => {
    try {
      const existing = await db.appSettings.where('key').equals('cardTypeIndicators').first()

      if (existing) {
        await db.appSettings.update(existing.id!, {
          value: { indicators } as CardTypeIndicatorsSettings,
          updatedAt: new Date().toISOString(),
        })
      } else {
        await db.appSettings.add({
          key: 'cardTypeIndicators',
          value: { indicators } as CardTypeIndicatorsSettings,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error('Error setting cardTypeIndicators:', error)
      throw error
    }
  },

  /**
   * Get Drive sync settings
   */
  getDriveSyncSettings: async (): Promise<DriveSyncSettings> => {
    try {
      const setting = await db.appSettings.where('key').equals('driveSync').first()

      if (setting) {
        // Return existing value
        const stored = setting.value as DriveSyncSettings

        // Ensure frequencyMinutes exists, fallback to config
        if (!stored.frequencyMinutes) {
          stored.frequencyMinutes = config.syncIntervalMinutes
          // Save the fix
          await db.appSettings.update(setting.id!, {
            value: stored,
            updatedAt: new Date().toISOString(),
          })
        }

        return stored
      }

      // No setting exists - create with defaults
      const defaults: DriveSyncSettings = {
        frequencyMinutes: config.syncIntervalMinutes,
        standaloneMode: undefined,
      }

      await db.appSettings.add({
        key: 'driveSync',
        value: defaults,
        updatedAt: new Date().toISOString(),
      })

      return defaults
    } catch (error) {
      console.error('Error getting driveSync settings:', error)
      throw error
    }
  },

  /**
   * Set Drive sync settings
   */
  setDriveSyncSettings: async (settings: DriveSyncSettings): Promise<void> => {
    try {
      const existing = await db.appSettings.where('key').equals('driveSync').first()

      if (existing) {
        await db.appSettings.update(existing.id!, {
          value: settings,
          updatedAt: new Date().toISOString(),
        })
      } else {
        await db.appSettings.add({
          key: 'driveSync',
          value: settings,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error('Error setting driveSync settings:', error)
      throw error
    }
  },

  /**
   * Get account owners mapping (which household member owns which card/bank account)
   */
  getAccountOwners: async (): Promise<AccountOwners> => {
    try {
      const setting = await db.appSettings.where('key').equals('accountOwners').first()
      return setting ? (setting.value as AccountOwners) : {}
    } catch (error) {
      console.error('Error getting accountOwners:', error)
      return {}
    }
  },

  /**
   * Set account owners mapping
   */
  setAccountOwners: async (owners: AccountOwners): Promise<void> => {
    try {
      const existing = await db.appSettings.where('key').equals('accountOwners').first()
      if (existing) {
        await db.appSettings.update(existing.id!, {
          value: owners,
          updatedAt: new Date().toISOString(),
        })
      } else {
        await db.appSettings.add({
          key: 'accountOwners',
          value: owners,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error('Error setting accountOwners:', error)
      throw error
    }
  },

  /**
   * Record a deleted syncId so merge-on-sync won't resurrect the record from cloud.
   */
  recordDeletion: async (tableName: string, syncId: string): Promise<void> => {
    try {
      const setting = await db.appSettings.where('key').equals('deletedRecords').first()
      const ledger: Record<string, string[]> = setting ? (setting.value as Record<string, string[]>) : {}
      if (!ledger[tableName]) ledger[tableName] = []
      if (!ledger[tableName].includes(syncId)) {
        ledger[tableName].push(syncId)
      }
      if (setting) {
        await db.appSettings.update(setting.id!, { value: ledger, updatedAt: new Date().toISOString() })
      } else {
        await db.appSettings.add({ key: 'deletedRecords', value: ledger, updatedAt: new Date().toISOString() })
      }
    } catch (error) {
      console.error('Error recording deletion:', error)
    }
  },

  /**
   * Get tax-exempt limit for a specific year.
   * Falls back to the legacy single-value format for backward compat.
   */
  getAnnualTaxLimit: async (year?: number): Promise<number | null> => {
    try {
      const setting = await db.appSettings.where('key').equals('annualTaxLimit').first()
      if (!setting) return null
      const value = setting.value
      // New format: { [year]: limit }
      if (typeof value === 'object' && value !== null) {
        const y = year ?? new Date().getFullYear()
        return (value as Record<string, number>)[String(y)] ?? null
      }
      // Legacy format: single number (applies to any year)
      return typeof value === 'number' ? value : null
    } catch (error) {
      console.error('Error getting annualTaxLimit:', error)
      return null
    }
  },

  /**
   * Get all per-year tax limits as a map.
   * Migrates legacy single-value format on read.
   */
  getAllTaxLimits: async (): Promise<Record<string, number>> => {
    try {
      const setting = await db.appSettings.where('key').equals('annualTaxLimit').first()
      if (!setting) return {}
      const value = setting.value
      if (typeof value === 'object' && value !== null) {
        return value as Record<string, number>
      }
      // Legacy: single number — treat as current year
      if (typeof value === 'number') {
        return { [String(new Date().getFullYear())]: value }
      }
      return {}
    } catch (error) {
      console.error('Error getting tax limits:', error)
      return {}
    }
  },

  /**
   * Set tax-exempt limit for a specific year
   */
  setAnnualTaxLimit: async (limit: number, year?: number): Promise<void> => {
    try {
      const y = String(year ?? new Date().getFullYear())
      const existing = await db.appSettings.where('key').equals('annualTaxLimit').first()
      let allLimits: Record<string, number> = {}
      if (existing) {
        const val = existing.value
        if (typeof val === 'object' && val !== null) {
          allLimits = { ...(val as Record<string, number>) }
        } else if (typeof val === 'number') {
          // Migrate legacy single value to current year
          allLimits = { [String(new Date().getFullYear())]: val }
        }
        allLimits[y] = limit
        await db.appSettings.update(existing.id!, {
          value: allLimits,
          updatedAt: new Date().toISOString(),
        })
      } else {
        allLimits[y] = limit
        await db.appSettings.add({
          key: 'annualTaxLimit',
          value: allLimits,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error('Error setting annualTaxLimit:', error)
      throw error
    }
  },

  /**
   * Get self-employed BTL limits for a specific year
   */
  getSelfEmployedBTLLimits: async (year?: number): Promise<SelfEmployedBTLLimits | null> => {
    try {
      const setting = await db.appSettings.where('key').equals('selfEmployedBTL').first()
      if (!setting) return null
      const value = setting.value as Record<string, SelfEmployedBTLLimits>
      const y = String(year ?? new Date().getFullYear())
      return value[y] ?? null
    } catch (error) {
      console.error('Error getting selfEmployedBTL:', error)
      return null
    }
  },

  /**
   * Get all per-year self-employed BTL limits
   */
  getAllSelfEmployedBTLLimits: async (): Promise<Record<string, SelfEmployedBTLLimits>> => {
    try {
      const setting = await db.appSettings.where('key').equals('selfEmployedBTL').first()
      if (!setting) return {}
      return (setting.value as Record<string, SelfEmployedBTLLimits>) || {}
    } catch (error) {
      console.error('Error getting selfEmployedBTL:', error)
      return {}
    }
  },

  /**
   * Set self-employed BTL limits for a specific year
   */
  setSelfEmployedBTLLimits: async (limits: SelfEmployedBTLLimits, year?: number): Promise<void> => {
    try {
      const y = String(year ?? new Date().getFullYear())
      const existing = await db.appSettings.where('key').equals('selfEmployedBTL').first()
      let allLimits: Record<string, SelfEmployedBTLLimits> = {}
      if (existing) {
        allLimits = { ...(existing.value as Record<string, SelfEmployedBTLLimits>) }
        allLimits[y] = limits
        await db.appSettings.update(existing.id!, {
          value: allLimits,
          updatedAt: new Date().toISOString(),
        })
      } else {
        allLimits[y] = limits
        await db.appSettings.add({
          key: 'selfEmployedBTL',
          value: allLimits,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error('Error setting selfEmployedBTL:', error)
      throw error
    }
  },

  /**
   * Initialize default settings if not already set
   */
  initialize: async (): Promise<void> => {
    try {
      const [cardIndicatorCount, driveSyncCount] = await Promise.all([
        db.appSettings.where('key').equals('cardTypeIndicators').count(),
        db.appSettings.where('key').equals('driveSync').count(),
      ])

      if (cardIndicatorCount === 0) {
        await db.appSettings.add({
          key: 'cardTypeIndicators',
          value: DEFAULT_CARD_INDICATORS,
          updatedAt: new Date().toISOString(),
        })
        console.log('✅ Initialized default cardTypeIndicators settings')
      }

      if (driveSyncCount === 0) {
        await db.appSettings.add({
          key: 'driveSync',
          value: DEFAULT_DRIVE_SYNC_SETTINGS,
          updatedAt: new Date().toISOString(),
        })
        console.log('✅ Initialized default driveSync settings')
      }
    } catch (error) {
      console.error('Error initializing app settings:', error)
    }
  },
}
