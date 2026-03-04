import { BusinessType } from './business'

export type BusinessTypeConfig = {
  /** Hebrew display label */
  label: string
  /** Emoji icon */
  icon: string
  /** Badge background color (light) */
  badgeBackground: string
  /** Badge text color (dark) */
  badgeColor: string
}

export const BUSINESS_TYPE_CONFIG: Record<BusinessType, BusinessTypeConfig> = {
  [BusinessType.Personal]: {
    label: 'אישי',
    icon: '🏠',
    badgeBackground: '#dbeafe', // blue-100
    badgeColor: '#1e40af',      // blue-800
  },
  [BusinessType.Business]: {
    label: 'עסקי',
    icon: '🏢',
    badgeBackground: '#dcfce7', // green-100
    badgeColor: '#166534',      // green-800
  },
  [BusinessType.Teacher]: {
    label: 'מורה',
    icon: '👩‍🏫',
    badgeBackground: '#fef3c7', // amber-100
    badgeColor: '#92400e',      // amber-800
  },
  [BusinessType.Artist]: {
    label: 'אמן',
    icon: '🎨',
    badgeBackground: '#ede9fe', // violet-100
    badgeColor: '#5b21b6',      // violet-800
  },
}
