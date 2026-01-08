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

/**
 * Add months to a month string (MM/YYYY format)
 * @param monthStr - Month string in MM/YYYY format
 * @param delta - Number of months to add (can be negative)
 * @returns New month string in MM/YYYY format
 */
export const addMonths = (monthStr: string, delta: number): string => {
  const [month, year] = monthStr.split('/').map(Number)

  // Convert to total months from year 0
  let totalMonths = year * 12 + (month - 1)
  totalMonths += delta

  // Convert back to month/year
  const newYear = Math.floor(totalMonths / 12)
  const newMonth = (totalMonths % 12) + 1

  return `${String(newMonth).padStart(2, '0')}/${newYear}`
}

/**
 * Compare two dates in DD/MM/YYYY format
 * @param a - First date
 * @param b - Second date
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export const compareDates = (a: string, b: string): number => {
  const [aDay, aMonth, aYear] = a.split('/').map(Number)
  const [bDay, bMonth, bYear] = b.split('/').map(Number)

  const aDate = new Date(aYear, aMonth - 1, aDay)
  const bDate = new Date(bYear, bMonth - 1, bDay)

  return aDate.getTime() - bDate.getTime()
}

/**
 * Format currency with symbol
 * @param amount - The amount to format
 * @param currency - Currency code (ILS, USD, EUR)
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number, currency: 'ILS' | 'USD' | 'EUR'): string => {
  const symbols = {
    ILS: '₪',
    USD: '$',
    EUR: '€',
  }

  return (
    new Intl.NumberFormat('he-IL', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount) +
    ' ' +
    symbols[currency]
  )
}
