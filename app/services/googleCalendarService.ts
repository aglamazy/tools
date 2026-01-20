/**
 * Google Calendar Service
 * Handles fetching calendar events from Google Calendar API
 */

import { getFirebaseAuth } from '@/app/lib/firebase'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_TOKEN_KEY = 'google_calendar_token'

export type CalendarEvent = {
  id: string
  summary: string
  start: string // ISO date-time or date
  end: string // ISO date-time or date
  startTime: string // HH:MM format
  endTime: string // HH:MM format
  isAllDay: boolean
}

// Store the access token in memory (loaded from storage on init)
let calendarAccessToken: string | null = null

/**
 * Initialize calendar token from storage
 */
function loadTokenFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const stored = sessionStorage.getItem(CALENDAR_TOKEN_KEY)
    if (stored) {
      calendarAccessToken = stored
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Save token to storage
 */
function saveTokenToStorage(token: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CALENDAR_TOKEN_KEY, token)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear token from storage
 */
function clearTokenFromStorage(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(CALENDAR_TOKEN_KEY)
  } catch {
    // Ignore storage errors
  }
}

// Load token on module init
loadTokenFromStorage()

/**
 * Check if we have a calendar access token
 */
export function hasCalendarAccess(): boolean {
  if (!calendarAccessToken) {
    loadTokenFromStorage()
  }
  return calendarAccessToken !== null
}

/**
 * Get the current calendar access token
 */
export function getCalendarAccessToken(): string | null {
  return calendarAccessToken
}

/**
 * Clear the calendar access token (e.g., on sign out)
 */
export function clearCalendarAccess(): void {
  calendarAccessToken = null
  clearTokenFromStorage()
}

/**
 * Request calendar access by re-authenticating with Google
 * This triggers a popup that requests the calendar.readonly scope
 */
export async function requestCalendarAccess(): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()

    // Add calendar scope
    provider.addScope(CALENDAR_SCOPE)
    // Force account selection to ensure fresh consent
    provider.setCustomParameters({
      prompt: 'consent',
    })

    const result = await signInWithPopup(auth, provider)

    // Get the OAuth credential which contains the access token
    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (credential?.accessToken) {
      calendarAccessToken = credential.accessToken
      saveTokenToStorage(credential.accessToken)
      return { success: true }
    }

    return { success: false, error: 'לא התקבל טוקן גישה ללוח שנה' }
  } catch (err: any) {
    console.error('[Calendar] Auth failed:', err.code, err.message)

    if (err.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'החלון נסגר לפני השלמת ההתחברות' }
    }
    if (err.code === 'auth/popup-blocked') {
      return { success: false, error: 'החלון נחסם. אפשר חלונות קופצים ונסה שוב' }
    }

    return { success: false, error: 'שגיאה בהתחברות ללוח שנה' }
  }
}

/**
 * Fetch calendar events for a specific date
 */
export async function fetchCalendarEvents(date: string): Promise<{ events: CalendarEvent[]; error?: string }> {
  if (!calendarAccessToken) {
    return { events: [], error: 'לא מחובר ללוח שנה' }
  }

  try {
    // Create time bounds for the date (full day in local timezone)
    const startOfDay = new Date(`${date}T00:00:00`)
    const endOfDay = new Date(`${date}T23:59:59`)

    const params = new URLSearchParams({
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    })

    const response = await fetch(
      `${CALENDAR_API_BASE}/calendars/primary/events?${params}`,
      {
        headers: {
          Authorization: `Bearer ${calendarAccessToken}`,
        },
      }
    )

    if (response.status === 401) {
      // Token expired or invalid
      calendarAccessToken = null
      clearTokenFromStorage()
      return { events: [], error: 'פג תוקף ההרשאה. התחבר מחדש ללוח שנה' }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Calendar] API error:', response.status, errorData)
      return { events: [], error: 'שגיאה בטעינת אירועים מלוח שנה' }
    }

    const data = await response.json()

    const events: CalendarEvent[] = (data.items || [])
      .filter((item: any) => item.status !== 'cancelled')
      .map((item: any): CalendarEvent => {
        const isAllDay = !item.start.dateTime

        let startTime = ''
        let endTime = ''

        if (!isAllDay) {
          // Parse the dateTime and extract local time
          const startDate = new Date(item.start.dateTime)
          const endDate = new Date(item.end.dateTime)
          startTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
          endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`
        }

        return {
          id: item.id,
          summary: item.summary || '(ללא כותרת)',
          start: item.start.dateTime || item.start.date,
          end: item.end.dateTime || item.end.date,
          startTime,
          endTime,
          isAllDay,
        }
      })

    return { events }
  } catch (err: any) {
    console.error('[Calendar] Fetch error:', err)
    return { events: [], error: 'שגיאת רשת בטעינת לוח שנה' }
  }
}
