import { describe, it, expect } from 'vitest'
import type { CalendarEvent } from '@/app/services/googleCalendarService'
import { filterEventsByColor, GOOGLE_EVENT_COLORS } from './eventColors'

const event = (id: string, colorId?: string): CalendarEvent => ({
  id, summary: `שיעור ${id}`, start: '2026-10-05T16:00:00+03:00', end: '2026-10-05T17:00:00+03:00',
  startTime: '16:00', endTime: '17:00', isAllDay: false,
  ...(colorId ? { colorId } : {}),
})

const events = [event('a', '5'), event('b', '7'), event('c'), event('d', '5')]

describe('filterEventsByColor (aglamazo#439)', () => {
  it('no color chosen → every event (unchanged behaviour)', () => {
    expect(filterEventsByColor(events)).toBe(events)
    expect(filterEventsByColor(events, '')).toBe(events)
    expect(filterEventsByColor(events, '  ')).toBe(events)
  })

  it('yellow chosen → only the yellow events', () => {
    expect(filterEventsByColor(events, '5').map(e => e.id)).toEqual(['a', 'd'])
  })

  it('an event in the calendar default color (no colorId) never matches a chosen color', () => {
    expect(filterEventsByColor([event('c')], '5')).toEqual([])
  })

  it('palette is Google\'s fixed 11 colors, yellow = "5"', () => {
    expect(GOOGLE_EVENT_COLORS.map(c => c.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'])
    expect(GOOGLE_EVENT_COLORS.find(c => c.id === '5')?.name).toContain('צהוב')
  })
})
