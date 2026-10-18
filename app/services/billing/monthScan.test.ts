import { describe, it, expect } from 'vitest'
import type { Student } from '@/app/types/student'
import type { CalendarEvent } from '@/app/services/googleCalendarService'
import { scanMonth, matchStudent, normalizeName } from './monthScan'

let seq = 0
function student(name: string, extra: Partial<Student> = {}): Student {
  seq += 1
  return {
    id: seq,
    syncId: `s-${seq}`,
    businessId: 'biz',
    name,
    lessonRate: 150,
    archived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...extra,
  }
}

// Local-time ISO (no zone) at noon, so the local day is stable in any TZ.
function lesson(id: string, summary: string, day: number, isAllDay = false): CalendarEvent {
  const d = String(day).padStart(2, '0')
  return {
    id,
    summary,
    start: isAllDay ? `2026-09-${d}` : `2026-09-${d}T12:00:00`,
    end: isAllDay ? `2026-09-${d}` : `2026-09-${d}T12:45:00`,
    startTime: isAllDay ? '' : '12:00',
    endTime: isAllDay ? '' : '12:45',
    isAllDay,
  }
}

describe('scanMonth', () => {
  it('matches an exact name', () => {
    const dana = student('דנה')
    const scan = scanMonth([lesson('e1', 'דנה', 3)], [dana])
    expect(scan.matched).toHaveLength(1)
    expect(scan.matched[0].student).toBe(dana)
    expect(scan.matched[0].lessons).toEqual([{ eventId: 'e1', date: '2026-09-03', startTime: '12:00', title: 'דנה' }])
    expect(scan.unknown).toEqual([])
  })

  it('matches when the title contains the name (substring)', () => {
    const dana = student('דנה')
    const scan = scanMonth([lesson('e1', 'שיעור פסנתר - דנה', 4)], [dana])
    expect(scan.matched[0].student).toBe(dana)
    expect(scan.lessons[0].student).toBe(dana)
  })

  it('prefers the longest matching name', () => {
    const moshe = student('משה')
    const mosheLevi = student('משה לוי')
    const scan = scanMonth([lesson('e1', 'משה לוי', 5), lesson('e2', 'משה', 6)], [moshe, mosheLevi])
    expect(scan.lessons.map(l => l.student)).toEqual([mosheLevi, moshe])
    expect(matchStudent('שיעור משה לוי', [moshe, mosheLevi])).toBe(mosheLevi)
    expect(matchStudent('שיעור משה לוי', [mosheLevi, moshe])).toBe(mosheLevi)
  })

  it('never matches an archived student', () => {
    const gone = student('יוסי', { archived: true })
    const scan = scanMonth([lesson('e1', 'יוסי', 7)], [gone])
    expect(scan.matched).toEqual([])
    expect(scan.unknown).toHaveLength(1)
    expect(scan.unknown[0].name).toBe('יוסי')
  })

  it('groups an unknown name with its lesson count', () => {
    const scan = scanMonth(
      [lesson('e1', 'נועה', 1), lesson('e2', 'דנה', 2), lesson('e3', 'נועה', 8), lesson('e4', ' נועה ', 15)],
      [student('דנה')],
    )
    expect(scan.unknown).toHaveLength(1)
    expect(scan.unknown[0]).toMatchObject({ key: 'נועה', name: 'נועה' })
    expect(scan.unknown[0].lessons.map(l => l.eventId)).toEqual(['e1', 'e3', 'e4'])
  })

  it('ignores RTL/LTR marks, extra whitespace and case in a title', () => {
    const mosheLevi = student('משה  לוי')
    const anna = student('Anna')
    const scan = scanMonth(
      [lesson('e1', '‏ משה \t לוי‎ ', 9), lesson('e2', '‪ANNA‬', 10), lesson('e3', '‏רון  כהן', 11), lesson('e4', 'רון כהן', 12)],
      [mosheLevi, anna],
    )
    expect(scan.lessons.map(l => l.student)).toEqual([mosheLevi, anna, undefined, undefined])
    expect(scan.unknown).toHaveLength(1)
    expect(scan.unknown[0]).toMatchObject({ key: 'רון כהן', name: 'רון כהן' })
    expect(scan.unknown[0].lessons).toHaveLength(2)
    expect(normalizeName('‏ ANNA  Lee‎')).toBe('anna lee')
  })

  it('skips all-day events and lists untitled lessons without a group', () => {
    const scan = scanMonth([lesson('e1', 'חופש', 13, true), lesson('e2', '  ', 14)], [])
    expect(scan.lessons.map(l => l.eventId)).toEqual(['e2'])
    expect(scan.unknown).toEqual([])
  })

  it('re-scan after creating the student moves the lessons onto them', () => {
    const events = [lesson('e1', 'נועה', 1), lesson('e2', 'נועה', 8)]
    expect(scanMonth(events, []).unknown[0].lessons).toHaveLength(2)
    const noa = student('נועה')
    const after = scanMonth(events, [noa])
    expect(after.unknown).toEqual([])
    expect(after.matched[0].lessons).toHaveLength(2)
  })
})
