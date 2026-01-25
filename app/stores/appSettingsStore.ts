// App Settings Store - Uses IndexedDB via Dexie

import { db, AppSettings } from '@/app/db/financeDB'
import { config } from '@/app/config'

export interface CardTypeIndicatorsSettings {
  indicators: string[]
}

export interface YpayCredentials {
  clientId: string
  clientSecret: string
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
   * Get YPAY API credentials
   */
  getYpayCredentials: async (): Promise<YpayCredentials | null> => {
    try {
      const setting = await db.appSettings.where('key').equals('ypayCredentials').first()
      return setting ? (setting.value as YpayCredentials) : null
    } catch (error) {
      console.error('Error getting ypayCredentials:', error)
      return null
    }
  },

  /**
   * Set YPAY API credentials
   */
  setYpayCredentials: async (credentials: YpayCredentials): Promise<void> => {
    try {
      const existing = await db.appSettings.where('key').equals('ypayCredentials').first()
      if (existing) {
        await db.appSettings.update(existing.id!, {
          value: credentials,
          updatedAt: new Date().toISOString(),
        })
      } else {
        await db.appSettings.add({
          key: 'ypayCredentials',
          value: credentials,
          updatedAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error('Error setting ypayCredentials:', error)
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
