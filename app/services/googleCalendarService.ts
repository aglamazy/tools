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

/** Google's alias for the signed-in user's main calendar — used when no calendar is chosen. */
export const PRIMARY_CALENDAR_ID = 'primary'

export type CalendarEvent = {
  id: string
  summary: string
  start: string // ISO date-time or date
  end: string // ISO date-time or date
  startTime: string // HH:MM format
  endTime: string // HH:MM format
  isAllDay: boolean
  /** Google event colorId ("1".."11"); absent = the calendar's own color (aglamazo#439). */
  colorId?: string
}

export type CalendarListEntry = {
  id: string
  summary: string
  primary: boolean
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

/** A business's billingCalendarId, or 'primary' when it is unset/empty. */
export function resolveCalendarId(calendarId?: string): string {
  return calendarId?.trim() || PRIMARY_CALENDAR_ID
}

/**
 * Fetch calendar events for a specific date.
 * @param calendarId  calendar to read (e.g. a Business.billingCalendarId); unset → 'primary'
 */
export async function fetchCalendarEvents(
  date: string,
  calendarId?: string
): Promise<{ events: CalendarEvent[]; error?: string }> {
  const timeMin = new Date(`${date}T00:00:00`)
  const timeMax = new Date(`${date}T23:59:59`)
  const result = await withTokenRetry(token => fetchEventsRange(resolveCalendarId(calendarId), timeMin, timeMax, token))
  return { events: result.data ?? [], error: result.error }
}

/**
 * Read a whole calendar month of events (aglamazo#430) — one ranged query,
 * every page followed via nextPageToken. Cancelled events are dropped.
 * @param month       1-based month, local time (1st 00:00 → 1st of next month 00:00)
 * @param calendarId  calendar to read (a Business.billingCalendarId); unset → 'primary'
 */
export async function fetchMonthEvents(
  year: number,
  month: number,
  calendarId?: string
): Promise<{ events: CalendarEvent[]; error?: string }> {
  const timeMin = new Date(year, month - 1, 1)
  const timeMax = new Date(year, month, 1)
  const result = await withTokenRetry(token => fetchEventsRange(resolveCalendarId(calendarId), timeMin, timeMax, token))
  return { events: result.data ?? [], error: result.error }
}

/**
 * List the calendars the signed-in Google account can see (calendarList.list).
 * Covered by the existing calendar.readonly scope (googleTokenService SCOPES).
 */
export async function fetchCalendarList(): Promise<{ calendars: CalendarListEntry[]; error?: string }> {
  const result = await withTokenRetry(fetchCalendarListWithToken)
  return { calendars: result.data ?? [], error: result.error }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

type ApiResult<T> = { data?: T; error?: string; retryAuth?: boolean }

/** Run a Calendar API call with the browser token; on 401 get a token again and retry once. */
async function withTokenRetry<T>(
  call: (token: string) => Promise<ApiResult<T>>
): Promise<{ data?: T; error?: string }> {
  let token = await getAccessToken()
  if (!token) {
    return { error: 'Not connected to calendar' }
  }

  const result = await call(token)

  // If 401, try refreshing once and retry
  if (result.retryAuth) {
    token = await getAccessToken()
    if (!token) {
      return { error: 'Token refresh failed. Please reconnect to calendar.' }
    }
    const retry = await call(token)
    if (retry.retryAuth) {
      // Fail soft — do NOT clearGoogleAccess() here. A bare 401 from this one
      // API call isn't a Google-confirmed "this grant is dead" signal (unlike
      // gmailService.ts's SCOPE_INSUFFICIENT check or googleTokenService.ts's
      // own invalid_grant check on the refresh response) — it's exactly the
      // kind of failure the invalid_grant guard exists to NOT overreact to.
      // getAccessToken() above already owns the one legitimate dead-grant
      // check; clearing again here on a plain 401 wiped Drive+Gmail access
      // too, since all three share one grant (aglamazo#343, 2026-09-08).
      return { error: 'Authorization expired. Please reconnect to calendar.' }
    }
    return { data: retry.data, error: retry.error }
  }

  return { data: result.data, error: result.error }
}

// Google caps maxResults at 2500 per page; the loop follows nextPageToken past that.
const EVENTS_PAGE_SIZE = '2500'

async function fetchEventsRange(
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  token: string
): Promise<ApiResult<CalendarEvent[]>> {
  try {
    const events: CalendarEvent[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: EVENTS_PAGE_SIZE,
      })
      if (pageToken) params.set('pageToken', pageToken)

      const response = await fetch(
        `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )

      if (response.status === 401) {
        return { retryAuth: true }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[Calendar] API error:', response.status, calendarId, errorData)
        return { error: response.status === 404 ? 'Calendar not found' : 'Error loading calendar events' }
      }

      const data = await response.json()
      for (const item of data.items || []) {
        if (item.status === 'cancelled') continue
        events.push(toCalendarEvent(item))
      }
      pageToken = data.nextPageToken || undefined
    } while (pageToken)

    return { data: events }
  } catch (err: any) {
    console.error('[Calendar] Fetch error:', err)
    return { error: 'Network error loading calendar' }
  }
}

async function fetchCalendarListWithToken(token: string): Promise<ApiResult<CalendarListEntry[]>> {
  try {
    const calendars: CalendarListEntry[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({ minAccessRole: 'reader', maxResults: '250' })
      if (pageToken) params.set('pageToken', pageToken)

      const response = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.status === 401) {
        return { retryAuth: true }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[Calendar] calendarList error:', response.status, errorData)
        return { error: 'Error loading calendar list' }
      }

      const data = await response.json()
      for (const item of data.items || []) {
        if (item.deleted) continue
        calendars.push({
          id: item.id,
          summary: item.summaryOverride || item.summary || item.id,
          primary: !!item.primary,
        })
      }
      pageToken = data.nextPageToken || undefined
    } while (pageToken)

    return { data: calendars }
  } catch (err: any) {
    console.error('[Calendar] calendarList fetch error:', err)
    return { error: 'Network error loading calendar list' }
  }
}

function toCalendarEvent(item: any): CalendarEvent {
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
    ...(item.colorId ? { colorId: String(item.colorId) } : {}),
  }
}
