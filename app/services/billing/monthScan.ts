import type { Student } from '@/app/types/student'
import type { CalendarEvent } from '@/app/services/googleCalendarService'

/**
 * Month scan for calendar billing (aglamazo#431): match a month's calendar
 * events (lessons) to the business's students by name, and group the lessons
 * no student matches by the name in their title so each can become a student.
 *
 * Rule: a lesson belongs to a student when the normalized event title CONTAINS
 * the student's normalized name. When several students match, the longest name
 * wins ("משה לוי" beats "משה"). Archived students never match. All-day events
 * are not lessons and are skipped.
 */

export type ScanLesson = {
  eventId: string
  date: string // YYYY-MM-DD, local day the lesson shows on
  startTime: string // HH:MM
  title: string // the event summary as shown in the calendar
}

export type StudentLessons = { student: Student; lessons: ScanLesson[] }

export type UnknownName = {
  key: string // normalized name — the grouping key
  name: string // display name (cleaned title, original case) — prefills the create form
  lessons: ScanLesson[]
}

export type MonthScan = {
  /** Every lesson in calendar order, with its student when one matched. */
  lessons: Array<ScanLesson & { student?: Student }>
  /** Students that have at least one lesson this month, in first-lesson order. */
  matched: StudentLessons[]
  /** Unmatched lessons grouped by normalized title, in first-lesson order. */
  unknown: UnknownName[]
}

// Invisible Unicode directional characters (RTL/LTR marks, embeddings, isolates) — same set as studentBillingContact.ts
const DIRECTION_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/** Strip direction marks, trim and collapse whitespace — keeps case (for display). */
export function cleanName(s: string): string {
  return s.replace(DIRECTION_MARKS, '').replace(/\s+/g, ' ').trim()
}

/** The comparison form of a name or title: cleaned and lower-cased. */
export function normalizeName(s: string): string {
  return cleanName(s).toLowerCase()
}

/** YYYY-MM-DD of a timed event's start, in local time (the day the lesson shows on). */
export function localDateOf(isoDateTime: string): string {
  const d = new Date(isoDateTime)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The student a title belongs to, or undefined. Longest matching name wins. */
export function matchStudent(title: string, students: Student[]): Student | undefined {
  const normTitle = normalizeName(title)
  if (!normTitle) return undefined
  let best: Student | undefined
  let bestLen = 0
  for (const s of students) {
    if (s.archived) continue
    const normName = normalizeName(s.name)
    if (!normName || !normTitle.includes(normName)) continue
    if (normName.length > bestLen) {
      best = s
      bestLen = normName.length
    }
  }
  return best
}

export function scanMonth(events: CalendarEvent[], students: Student[]): MonthScan {
  const lessons: MonthScan['lessons'] = []
  const matchedBy = new Map<Student, StudentLessons>()
  const unknownBy = new Map<string, UnknownName>()

  for (const event of events) {
    if (event.isAllDay) continue
    const lesson: ScanLesson = {
      eventId: event.id,
      date: localDateOf(event.start),
      startTime: event.startTime,
      title: event.summary,
    }
    const student = matchStudent(event.summary, students)
    lessons.push(student ? { ...lesson, student } : lesson)

    if (student) {
      let entry = matchedBy.get(student)
      if (!entry) {
        entry = { student, lessons: [] }
        matchedBy.set(student, entry)
      }
      entry.lessons.push(lesson)
      continue
    }

    const key = normalizeName(event.summary)
    if (!key) continue // an untitled event names no one — listed as a lesson only
    let group = unknownBy.get(key)
    if (!group) {
      group = { key, name: cleanName(event.summary), lessons: [] }
      unknownBy.set(key, group)
    }
    group.lessons.push(lesson)
  }

  return { lessons, matched: [...matchedBy.values()], unknown: [...unknownBy.values()] }
}
