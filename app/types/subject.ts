export type SubjectType = 'general' | 'application'

export interface ApplicationProfile {
  fullName: string
  fieldOfStudy: string
  institution: string
  cvGist: string // reusable body text
  defaultLanguage: 'en' | 'de' | 'fr' | 'he'
  openingTemplate?: string // saved opening paragraph
  bodyTemplate?: string // saved translated body
  closingTemplate?: string // saved closing/greeting
}

export interface SubjectData {
  name: string
  type: SubjectType
  application?: ApplicationProfile
  createdAt: string
  updatedAt?: string
}

export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  he: 'עברית',
}
