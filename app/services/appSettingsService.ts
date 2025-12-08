import { db, AppSettings } from '@/app/db/financeDB'

export interface CardTypeIndicatorsSettings {
  indicators: string[] // e.g., ['ישראכרט', 'פרימים אקספרס']
}

const DEFAULT_CARD_INDICATORS: CardTypeIndicatorsSettings = {
  indicators: ['ישראכרט', 'פרימים אקספרס'],
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
 * Initialize default settings if not already set
 * Call this on app startup
 */
export async function initializeAppSettings(): Promise<void> {
  try {
    const count = await db.appSettings.where('key').equals('cardTypeIndicators').count()
    if (count === 0) {
      await db.appSettings.add({
        key: 'cardTypeIndicators',
        value: DEFAULT_CARD_INDICATORS,
        updatedAt: new Date().toISOString(),
      })
      console.log('✅ Initialized default cardTypeIndicators settings')
    }
  } catch (error) {
    console.error('Error initializing app settings:', error)
  }
}
