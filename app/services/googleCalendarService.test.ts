import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/app/services/googleTokenService', () => ({
  hasGoogleAccess: vi.fn(async () => true),
  getAccessToken: vi.fn(async () => 'tok'),
  requestGoogleAccess: vi.fn(),
  clearGoogleAccess: vi.fn(),
}))

import { fetchMonthEvents, fetchCalendarList, resolveCalendarId } from './googleCalendarService'

const timed = (id: string, status = 'confirmed') => ({
  id,
  status,
  summary: `lesson ${id}`,
  start: { dateTime: '2026-09-03T10:00:00+03:00' },
  end: { dateTime: '2026-09-03T11:00:00+03:00' },
})

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('googleCalendarService month read (aglamazo#430)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('falls back to primary when no calendar is chosen', () => {
    expect(resolveCalendarId(undefined)).toBe('primary')
    expect(resolveCalendarId('')).toBe('primary')
    expect(resolveCalendarId('abc@group.calendar.google.com')).toBe('abc@group.calendar.google.com')
  })

  it('follows nextPageToken across pages, drops cancelled, reads the chosen calendar for the whole month', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [timed('a'), timed('x', 'cancelled')], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonResponse({ items: [timed('b')] }))

    const { events, error } = await fetchMonthEvents(2026, 9, 'lessons#1@group.calendar.google.com')

    expect(error).toBeUndefined()
    expect(events.map(e => e.id)).toEqual(['a', 'b'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const first = new URL(fetchMock.mock.calls[0][0])
    expect(first.pathname).toBe('/calendar/v3/calendars/lessons%231%40group.calendar.google.com/events')
    expect(new Date(first.searchParams.get('timeMin')!).getTime()).toBe(new Date(2026, 8, 1).getTime())
    expect(new Date(first.searchParams.get('timeMax')!).getTime()).toBe(new Date(2026, 9, 1).getTime())
    expect(first.searchParams.get('singleEvents')).toBe('true')
    expect(first.searchParams.has('pageToken')).toBe(false)

    const second = new URL(fetchMock.mock.calls[1][0])
    expect(second.searchParams.get('pageToken')).toBe('p2')
  })

  it('carries the event colorId through, absent when the event has none (aglamazo#439)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ ...timed('y'), colorId: '5' }, timed('n')] }))
    const { events } = await fetchMonthEvents(2026, 9)
    expect(events.find(e => e.id === 'y')?.colorId).toBe('5')
    expect('colorId' in events.find(e => e.id === 'n')!).toBe(false)
  })

  it('uses primary when the business has no billing calendar', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }))
    await fetchMonthEvents(2026, 12, undefined)
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.pathname).toBe('/calendar/v3/calendars/primary/events')
    expect(new Date(url.searchParams.get('timeMax')!).getTime()).toBe(new Date(2027, 0, 1).getTime())
  })

  it('surfaces an API error instead of returning a silent empty month', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 404))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { events, error } = await fetchMonthEvents(2026, 9, 'gone')
    expect(events).toEqual([])
    expect(error).toBe('Calendar not found')
    errSpy.mockRestore()
  })

  it('lists calendars across pages', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'me@x', summary: 'Me', primary: true }], nextPageToken: 'n' }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'l@g', summary: 'Lessons', summaryOverride: 'שיעורים' }, { id: 'd', deleted: true }] }))
    const { calendars, error } = await fetchCalendarList()
    expect(error).toBeUndefined()
    expect(calendars).toEqual([
      { id: 'me@x', summary: 'Me', primary: true },
      { id: 'l@g', summary: 'שיעורים', primary: false },
    ])
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/calendar/v3/users/me/calendarList')
  })
})
