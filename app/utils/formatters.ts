/**
 * Format a month string (MM/YYYY) to Hebrew month name and year
 * @param monthStr - Month string in MM/YYYY format
 * @returns Formatted string like "אוקטובר 2025"
 */
export const formatMonthDisplay = (monthStr: string): string => {
  const [month, year] = monthStr.split('/')
  const monthNames = [
    'ינואר',
    'פברואר',
    'מרץ',
    'אפריל',
    'מאי',
    'יוני',
    'יולי',
    'אוגוסט',
    'ספטמבר',
    'אוקטובר',
    'נובמבר',
    'דצמבר',
  ]
  const monthName = monthNames[parseInt(month, 10) - 1]
  return `${monthName} ${year}`
}

/**
 * Format an ISO date string to Hebrew locale date/time
 * @param isoDate - ISO date string
 * @returns Formatted date like "15/10/2025, 10:30"
 */
export const formatDateTime = (isoDate: string): string => {
  const date = new Date(isoDate)
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
