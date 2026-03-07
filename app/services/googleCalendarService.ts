/**
 * Google Calendar Service
 * Handles fetching calendar events from Google Calendar API.
 * Token management is delegated to googleTokenService.
 */

import {
  hasGoogleAccess,
  getAccessToken,
  requestGoogleAccess,
  clearGoogleAccess,
} from '@/app/services/googleTokenService'

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

export type CalendarEvent = {
  id: string
  summary: string
  start: string // ISO date-time or date
  end: string // ISO date-time or date
  startTime: string // HH:MM format
  endTime: string // HH:MM format
  isAllDay: boolean
}

/**
 * Check if we have calendar (Google) access
 */
export async function hasCalendarAccess(): Promise<boolean> {
  return hasGoogleAccess()
}

/**
 * Get the current calendar access token
 */
export async function getCalendarAccessToken(): Promise<string | null> {
  return getAccessToken()
}

/**
 * Request calendar access via Google OAuth popup
 */
export async function requestCalendarAccess(): Promise<{ success: boolean; error?: string }> {
  return requestGoogleAccess()
}

/**
 * Clear the calendar access token (e.g., on sign out)
 */
export async function clearCalendarAccess(): Promise<void> {
  return clearGoogleAccess()
}

/**
 * Fetch calendar events for a specific date
 */
export async function fetchCalendarEvents(date: string): Promise<{ events: CalendarEvent[]; error?: string }> {
  let token = await getAccessToken()
  if (!token) {
    return { events: [], error: 'Not connected to calendar' }
  }

  const result = await fetchEventsWithToken(date, token)

  // If 401, try refreshing once and retry
  if (result.retryAuth) {
    token = await getAccessToken()
    if (!token) {
      return { events: [], error: 'Token refresh failed. Please reconnect to calendar.' }
    }
    const retry = await fetchEventsWithToken(date, token)
    if (retry.retryAuth) {
      await clearGoogleAccess()
      return { events: [], error: 'Authorization expired. Please reconnect to calendar.' }
    }
    return { events: retry.events, error: retry.error }
  }

  return { events: result.events, error: result.error }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function fetchEventsWithToken(
  date: string,
  token: string
): Promise<{ events: CalendarEvent[]; error?: string; retryAuth?: boolean }> {
  try {
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
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (response.status === 401) {
      return { events: [], retryAuth: true }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Calendar] API error:', response.status, errorData)
      return { events: [], error: 'Error loading calendar events' }
    }

    const data = await response.json()

    const events: CalendarEvent[] = (data.items || [])
      .filter((item: any) => item.status !== 'cancelled')
      .map((item: any): CalendarEvent => {
        const isAllDay = !item.start.dateTime

        let startTime = ''
        let endTime = ''

        if (!isAllDay) {
          const startDate = new Date(item.start.dateTime)
          const endDate = new Date(item.end.dateTime)
          startTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
          endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`
        }

        return {
          id: item.id,
          summary: item.summary || '(No title)',
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
    return { events: [], error: 'Network error loading calendar' }
  }
}
