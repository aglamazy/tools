// App Settings Service - Facade over appSettingsStore
// This service layer exists for backwards compatibility with existing imports

import { appSettingsStore } from '@/app/stores/appSettingsStore'

export type { CardTypeIndicatorsSettings, DriveSyncSettings } from '@/app/stores/appSettingsStore'

export const getCardTypeIndicators = appSettingsStore.getCardTypeIndicators
export const setCardTypeIndicators = appSettingsStore.setCardTypeIndicators
export const getDriveSyncSettings = appSettingsStore.getDriveSyncSettings
export const setDriveSyncSettings = appSettingsStore.setDriveSyncSettings
export const initializeAppSettings = appSettingsStore.initialize
