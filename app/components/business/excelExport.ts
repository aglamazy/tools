import * as XLSX from 'xlsx'
import type { WeekEntry } from './timingTypes'
import { formatDisplayDate, formatHours, getMonthDates } from '@/app/lib/dateUtils'

function buildWorkbook(projectName: string, projectEntries: WeekEntry[], monthOffset: number) {
  const monthData = getMonthDates(monthOffset)
  const sortedEntries = [...projectEntries].sort((a, b) => a.date.localeCompare(b.date))

  const wsData: any[][] = []
  wsData.push([projectName])
  wsData.push([monthData.monthName])
  wsData.push([])
  wsData.push(['סה"כ שעות', 'שעות סיום', 'שעות התחלה', 'תאריך', 'משימה'])

  let projectTotal = 0
  sortedEntries.forEach(entry => {
    wsData.push([
      formatHours(entry.hours),
      entry.endTime,
      entry.startTime,
      formatDisplayDate(entry.date),
      entry.taskName,
    ])
    projectTotal += entry.hours
  })
  wsData.push([formatHours(projectTotal), '', '', `סה"כ ${projectName}:`, ''])

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  if (!ws['!views']) ws['!views'] = []
  ws['!views'][0] = { rightToLeft: true }
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
  ]
  if (!ws['!rows']) ws['!rows'] = []
  ws['!rows'][0] = { hpt: 20 }
  ws['!rows'][1] = { hpt: 18 }
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ]

  XLSX.utils.book_append_sheet(wb, ws, monthData.monthName)

  const fileName = `${projectName}_${monthData.monthName.replace(' ', '_')}.xlsx`
  return { wb, fileName }
}

export function exportToExcel(projectName: string, projectEntries: WeekEntry[], monthOffset: number) {
  const { wb, fileName } = buildWorkbook(projectName, projectEntries, monthOffset)
  XLSX.writeFile(wb, fileName)
}

export function generateExcelBase64(projectName: string, projectEntries: WeekEntry[], monthOffset: number): { base64: string; fileName: string } {
  const { wb, fileName } = buildWorkbook(projectName, projectEntries, monthOffset)
  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return { base64: btoa(binary), fileName }
}
