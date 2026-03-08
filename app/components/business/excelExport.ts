import * as XLSX from 'xlsx'
import type { WeekEntry } from './timingTypes'
import { formatDisplayDate, formatHours, getMonthDates } from '@/app/lib/dateUtils'

export function exportToExcel(projectName: string, projectEntries: WeekEntry[], monthOffset: number) {
  const monthData = getMonthDates(monthOffset)

  // Sort entries by date ascending
  const sortedEntries = [...projectEntries].sort((a, b) => a.date.localeCompare(b.date))

  // Create worksheet data
  const wsData: any[][] = []

  // Header
  wsData.push([projectName])
  wsData.push([monthData.monthName])
  wsData.push([]) // Empty row

  // Summary header (RTL order)
  wsData.push(['סה"כ שעות', 'שעות סיום', 'שעות התחלה', 'תאריך', 'משימה'])

  // Data rows - sorted by date ascending
  let projectTotal = 0

  sortedEntries.forEach(entry => {
    // RTL order: Hours, End Time, Start Time, Date, Task
    wsData.push([
      formatHours(entry.hours),
      entry.endTime,
      entry.startTime,
      formatDisplayDate(entry.date),
      entry.taskName,
    ])
    projectTotal += entry.hours
  })

  // Project total
  wsData.push([formatHours(projectTotal), '', '', `סה"כ ${projectName}:`, ''])

  // Create workbook
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set RTL mode
  if (!ws['!views']) ws['!views'] = []
  ws['!views'][0] = { rightToLeft: true }

  // Set column widths (RTL order)
  ws['!cols'] = [
    { wch: 12 }, // Hours
    { wch: 12 }, // End time
    { wch: 12 }, // Start time
    { wch: 12 }, // Date
    { wch: 25 }, // Task
  ]

  // Style the header rows
  if (!ws['!rows']) ws['!rows'] = []
  ws['!rows'][0] = { hpt: 20 } // Project name row height
  ws['!rows'][1] = { hpt: 18 } // Month row height

  // Merge cells for header
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // Project name across all columns
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, // Month across all columns
  ]

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, monthData.monthName)

  // Generate file name
  const fileName = `${projectName}_${monthData.monthName.replace(' ', '_')}.xlsx`

  // Download file
  XLSX.writeFile(wb, fileName)
}
