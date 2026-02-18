// Hebrew day and month names
export const DAY_NAMES_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export const MONTH_NAMES_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

// Date formatting
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

export function getDayName(dateStr: string): string {
  const date = new Date(dateStr)
  return DAY_NAMES_HE[date.getDay()]
}

export function adjustDate(dateStr: string, days: number): string {
  const date = new Date(dateStr)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

// Time formatting
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

// Week utilities
export function getWeekDates(weekOffset: number = 0): { start: string; end: string; days: string[] } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - dayOfWeek + (weekOffset * 7))
  sunday.setHours(12, 0, 0, 0)

  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    days.push(formatLocalDate(d))
  }

  return { start: days[0], end: days[6], days }
}

export function formatWeekRange(days: string[]): string {
  const start = new Date(days[0])
  const end = new Date(days[6])
  return `${start.getDate()}/${start.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`
}

// Month utilities
export function getMonthDates(monthOffset: number = 0): { start: string; end: string; monthName: string } {
  const now = new Date()
  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = targetDate.getFullYear()
  const month = targetDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  return {
    start: formatLocalDate(firstDay),
    end: formatLocalDate(lastDay),
    monthName: `${MONTH_NAMES_HE[month]} ${year}`,
  }
}

export function getCalendarDays(monthOffset: number = 0): { date: string; isCurrentMonth: boolean }[] {
  const now = new Date()
  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = targetDate.getFullYear()
  const month = targetDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = firstDay.getDay()

  const days: { date: string; isCurrentMonth: boolean }[] = []

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: formatLocalDate(d), isCurrentMonth: false })
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: formatLocalDate(new Date(year, month, d)), isCurrentMonth: true })
  }

  while (days.length < 35) {
    const nextDay = days.length - startDayOfWeek - lastDay.getDate() + 1
    days.push({ date: formatLocalDate(new Date(year, month + 1, nextDay)), isCurrentMonth: false })
  }

  return days
}
