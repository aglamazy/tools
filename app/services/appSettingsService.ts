import { db, AppSettings } from '@/app/db/financeDB'
import { config } from '@/app/config'

export interface CardTypeIndicatorsSettings {
  indicators: string[] // e.g., ['ישראכרט', 'פרימים אקספרס']
}

const DEFAULT_CARD_INDICATORS: CardTypeIndicatorsSettings = {
  indicators: ['ישראכרט', 'פרימיום אקספרס'],
}

export interface DriveSyncSettings {
  autoSyncEnabled: boolean
  frequencyMinutes: number
  lastSyncAt?: string
  lastSyncError?: string
  driveFileId?: string
  remoteModifiedAt?: string
}

const DEFAULT_DRIVE_SYNC_SETTINGS: DriveSyncSettings = {
  autoSyncEnabled: false,
  frequencyMinutes: config.syncIntervalSeconds / 60,
}

/**
 * Get card type indicators from settings
 * Returns default value if not set
 */
export async function getCardTypeIndicators(): Promise<string[]> {
  try {
    const setting = await db.appSettings.where('key').equals('cardTypeIndicators').first()
    if (setting) {
      return (setting.value as CardTypeIndicatorsSettings).indicators
    }
  } catch (error) {
    console.error('Error reading cardTypeIndicators setting:', error)
  }
  return DEFAULT_CARD_INDICATORS.indicators
}

/**
 * Set card type indicators in settings
 */
export async function setCardTypeIndicators(indicators: string[]): Promise<void> {
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
}

/**
 * Drive sync settings helpers
 */
export async function getDriveSyncSettings(): Promise<DriveSyncSettings> {
  try {
    const setting = await db.appSettings.where('key').equals('driveSync').first()
    const minMinutes = config.syncIntervalSeconds / 60
    if (setting) {
      const merged: DriveSyncSettings = {
        ...DEFAULT_DRIVE_SYNC_SETTINGS,
        ...(setting.value as DriveSyncSettings),
      }

      // Force frequency to global constant (do not rely on older stored values)
      merged.frequencyMinutes = minMinutes

      try {
        await db.appSettings.update(setting.id!, {
          value: merged,
          updatedAt: new Date().toISOString(),
        })
      } catch (err) {
        console.error('Error updating driveSync min frequency:', err)
      }

      return merged
    }
  } catch (error) {
    console.error('Error reading driveSync setting:', error)
  }
  return { ...DEFAULT_DRIVE_SYNC_SETTINGS }
}

export async function setDriveSyncSettings(settings: DriveSyncSettings): Promise<void> {
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
}

/**
 * Initialize default settings if not already set
 * Call this on app startup
 */
export async function initializeAppSettings(): Promise<void> {
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
}
