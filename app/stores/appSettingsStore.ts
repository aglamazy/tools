// App Settings Store - Uses IndexedDB via Dexie

import { db } from '@/app/db/financeDB'
import { config } from '@/app/config'
import type { Notification, StoredNotification } from '@/app/types/notifications'

export interface CardTypeIndicatorsSettings {
  indicators: string[]
}

export type AccountOwners = Record<string, string> // key = "card:1234" or "bank:5678", value = Firebase UID

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

const BELL_NOTIFICATIONS_KEY = 'bellNotifications'
const MAX_BELL_NOTIFICATIONS = 50

type BellNotificationsSetting = {
  items: StoredNotification[]
}

const sortBellNotifications = (items: StoredNotification[]) =>
  [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

const trimBellNotifications = (items: StoredNotification[]) => sortBellNotifications(items).slice(0, MAX_BELL_NOTIFICATIONS)

const isBellNotificationActive = (item: StoredNotification) => !item.clearedAt

const toNotification = (item: StoredNotification): Notification => ({
  id: item.id,
  type: item.type,
  message: item.message,
  timestamp: new Date(item.timestamp),
  href: item.href,
})

const readBellNotificationsSetting = async (): Promise<BellNotificationsSetting> => {
  const setting = await db.appSettings.where('key').equals(BELL_NOTIFICATIONS_KEY).first()
  if (!setting) return { items: [] }

  const raw = setting.value as BellNotificationsSetting | StoredNotification[] | null | undefined
  if (Array.isArray(raw)) {
    return { items: raw }
  }
  if (raw && Array.isArray((raw as BellNotificationsSetting).items)) {
    return raw as BellNotificationsSetting
  }
  return { items: [] }
}

const writeBellNotificationsSetting = async (setting: BellNotificationsSetting): Promise<void> => {
  const value = { items: trimBellNotifications(setting.items) }
  const existing = await db.appSettings.where('key').equals(BELL_NOTIFICATIONS_KEY).first()

  if (existing) {
    await db.appSettings.update(existing.id!, {
      value,
      updatedAt: new Date().toISOString(),
    })
  } else {
    await db.appSettings.add({
      key: BELL_NOTIFICATIONS_KEY,
      value,
      updatedAt: new Date().toISOString(),
    })
  }
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
   * Get bottom tab bar configuration (array of page IDs)
   */
  getBottomTabConfig: async (): Promise<string[]> => {
    try {
      const setting = await db.appSettings.where('key').equals('bottomTabConfig').first()
      if (setting) return setting.value as string[]
      return null as unknown as string[]
    } catch (error) {
      console.error('Error getting bottomTabConfig:', error)
      return null as unknown as string[]
    }
  },

  /**
   * Set bottom tab bar configuration
   */
  setBottomTabConfig: async (tabIds: string[]): Promise<void> => {
    try {
      const existing = await db.appSettings.where('key').equals('bottomTabConfig').first()
      if (existing) {
        await db.appSettings.update(existing.id!, { value: tabIds, updatedAt: new Date().toISOString() })
      } else {
        await db.appSettings.add({ key: 'bottomTabConfig', value: tabIds, updatedAt: new Date().toISOString() })
      }
    } catch (error) {
      console.error('Error setting bottomTabConfig:', error)
      throw error
    }
  },

  /**
   * Get active task timer state
   */
  getActiveTaskTimer: async (): Promise<{ taskId: number; taskTitle: string; startedAt: string } | null> => {
    try {
      const setting = await db.appSettings.where('key').equals('activeTaskTimer').first()
      return setting ? (setting.value as { taskId: number; taskTitle: string; startedAt: string }) : null
    } catch (error) {
      console.error('Error getting activeTaskTimer:', error)
      return null
    }
  },

  /**
   * Set active task timer state (or null to clear)
   */
  setActiveTaskTimer: async (timer: { taskId: number; taskTitle: string; startedAt: string } | null): Promise<void> => {
    try {
      const existing = await db.appSettings.where('key').equals('activeTaskTimer').first()
      if (timer === null) {
        if (existing) await db.appSettings.delete(existing.id!)
        return
      }
      if (existing) {
        await db.appSettings.update(existing.id!, { value: timer, updatedAt: new Date().toISOString() })
      } else {
        await db.appSettings.add({ key: 'activeTaskTimer', value: timer, updatedAt: new Date().toISOString() })
      }
    } catch (error) {
      console.error('Error setting activeTaskTimer:', error)
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

  /**
   * Get the user's chosen default page (page ID from pageRegistry)
   */
  getDefaultPage: async (): Promise<string | null> => {
    try {
      const setting = await db.appSettings.where('key').equals('defaultPage').first()
      return setting ? (setting.value as string) : null
    } catch (error) {
      console.error('Error getting defaultPage:', error)
      return null
    }
  },

  /**
   * Set the user's chosen default page
   */
  setDefaultPage: async (pageId: string | null): Promise<void> => {
    try {
      const existing = await db.appSettings.where('key').equals('defaultPage').first()
      if (pageId === null) {
        if (existing) await db.appSettings.delete(existing.id!)
        return
      }
      if (existing) {
        await db.appSettings.update(existing.id!, { value: pageId, updatedAt: new Date().toISOString() })
      } else {
        await db.appSettings.add({ key: 'defaultPage', value: pageId, updatedAt: new Date().toISOString() })
      }
    } catch (error) {
      console.error('Error setting defaultPage:', error)
      throw error
    }
  },

  /**
   * Get active bell notifications for the notification center.
   */
  getBellNotifications: async (): Promise<Notification[]> => {
    try {
      const setting = await readBellNotificationsSetting()
      return sortBellNotifications(setting.items)
        .filter(isBellNotificationActive)
        .map(toNotification)
    } catch (error) {
      console.error('Error getting bellNotifications:', error)
      return []
    }
  },

  /**
   * Append a new bell notification and persist it.
   */
  addBellNotification: async (notification: Notification): Promise<void> => {
    try {
      const setting = await readBellNotificationsSetting()
      const nextItems: StoredNotification[] = [
        {
          id: notification.id,
          type: notification.type,
          message: notification.message,
          timestamp: notification.timestamp.toISOString(),
          href: notification.href,
        },
        ...setting.items,
      ]

      await writeBellNotificationsSetting({ items: nextItems })
    } catch (error) {
      console.error('Error adding bellNotification:', error)
    }
  },

  /**
   * Mark a single bell notification as cleared.
   */
  clearBellNotification: async (notificationId: string): Promise<void> => {
    try {
      const setting = await readBellNotificationsSetting()
      const now = new Date().toISOString()
      const nextItems = setting.items.map((item) =>
        item.id === notificationId ? { ...item, clearedAt: item.clearedAt ?? now } : item,
      )

      await writeBellNotificationsSetting({ items: nextItems })
    } catch (error) {
      console.error('Error clearing bellNotification:', error)
    }
  },

  /**
   * Mark all active bell notifications as cleared.
   */
  clearBellNotifications: async (): Promise<void> => {
    try {
      const setting = await readBellNotificationsSetting()
      if (setting.items.length === 0) return

      const now = new Date().toISOString()
      const nextItems = setting.items.map((item) => (isBellNotificationActive(item) ? { ...item, clearedAt: now } : item))

      await writeBellNotificationsSetting({ items: nextItems })
    } catch (error) {
      console.error('Error clearing bellNotifications:', error)
    }
  },

  // --- localStorage helpers (for ephemeral UI state) ---
  getLocal: (key: string, fallback = ''): string => {
    try { return localStorage.getItem(key) || fallback } catch { return fallback }
  },
  setLocal: (key: string, value: string): void => {
    try { localStorage.setItem(key, value) } catch { /* silent */ }
  },
}
