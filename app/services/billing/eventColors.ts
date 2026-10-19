import type { CalendarEvent } from '@/app/services/googleCalendarService'

/**
 * Optional color filter for calendar billing (aglamazo#439): a teacher who marks
 * paid lessons with one event color (Suzi: yellow) bills only events of that
 * color. Google Calendar's event palette is fixed — colorId "1".."11".
 */
export const GOOGLE_EVENT_COLORS: ReadonlyArray<{ id: string; name: string; hex: string }> = [
  { id: '1', name: 'לבנדר', hex: '#7986cb' },
  { id: '2', name: 'מרווה', hex: '#33b679' },
  { id: '3', name: 'ענבים', hex: '#8e24aa' },
  { id: '4', name: 'פלמינגו', hex: '#e67c73' },
  { id: '5', name: 'בננה (צהוב)', hex: '#f6bf26' },
  { id: '6', name: 'קלמנטינה', hex: '#f4511e' },
  { id: '7', name: 'טווס', hex: '#039be5' },
  { id: '8', name: 'גרפיט', hex: '#616161' },
  { id: '9', name: 'אוכמניות', hex: '#3f51b5' },
  { id: '10', name: 'בזיליקום', hex: '#0b8043' },
  { id: '11', name: 'עגבנייה', hex: '#d50000' },
]

/**
 * The events the billing scan treats as lessons. No color chosen ('' / unset)
 * → every event, today's behaviour. A color chosen → only events explicitly
 * given that color; an event left in the calendar's own color has no colorId
 * and is not counted.
 */
export function filterEventsByColor(events: CalendarEvent[], colorId?: string): CalendarEvent[] {
  const wanted = colorId?.trim()
  if (!wanted) return events
  return events.filter(e => e.colorId === wanted)
}
