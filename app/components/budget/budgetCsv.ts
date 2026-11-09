import type { BudgetTransaction } from '@/app/types/transactions'
import type { Category } from '@/app/types/category'
import { expenseSubject } from '@/app/components/budget/monthlySeries'

/**
 * CSV export of the budget page (aglamazo#466): the subject breakdown
 * ("פילוח הוצאות לפי נושא") and the month's transactions ("עסקאות").
 * Pure builders here; the page only triggers the download.
 */

type Cell = string | number

/** One CSV field: quoted when it holds a comma, quote or newline. */
function csvField(value: Cell): string {
  const s = typeof value === 'number' ? String(value) : value
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A UTF-8 BOM first, so Excel opens the Hebrew text correctly; CRLF line ends. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}

/** DD/MM/YYYY (the stored form) → YYYY-MM-DD, so string order is date order. */
const dateKey = (d: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d || '')
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : d || ''
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Every subject of the month, whatever the pie drill-down shows: one row per
 * parent subject (its total, sub-subjects included), then a row per
 * sub-subject. Same counting rule as the list (expenseSubject).
 */
export function subjectsCsv(transactions: BudgetTransaction[], categories: Category[]): string {
  const parents = new Map<string, { total: number; subs: Map<string, number> }>()
  for (const t of transactions) {
    const subject = expenseSubject(t, categories)
    if (!subject) continue
    const entry = parents.get(subject.parent.name) || { total: 0, subs: new Map<string, number>() }
    entry.total += Math.abs(t.amount)
    if (subject.sub) entry.subs.set(subject.sub.name, (entry.subs.get(subject.sub.name) || 0) + Math.abs(t.amount))
    parents.set(subject.parent.name, entry)
  }
  const rows: Cell[][] = []
  for (const [name, { total, subs }] of [...parents.entries()].sort((a, b) => b[1].total - a[1].total)) {
    rows.push([name, '', round2(total)])
    for (const [sub, subTotal] of [...subs.entries()].sort((a, b) => b[1] - a[1])) {
      rows.push([name, sub, round2(subTotal)])
    }
  }
  return toCsv(['נושא', 'תת-נושא', 'סכום'], rows)
}

/**
 * Every transaction of the month the table can show with no filter on
 * (credit-card charge rows are left out, as in the table), sorted by date.
 */
export function transactionsCsv(
  transactions: BudgetTransaction[],
  displayName: (business: string) => string = (b) => b,
): string {
  const rows: Cell[][] = transactions
    .filter((t) => !t.isCreditCardCharge)
    .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)))
    .map((t) => [
      t.date,
      displayName(t.business),
      t.category || '',
      t.amount,
      t.paymentMethod || '',
      t.isFixed ? 'כן' : '',
      t.installmentInfo || '',
    ])
  return toCsv(['תאריך', 'עסק', 'נושא', 'סכום', 'אמצעי תשלום', 'קבוע', 'תשלום'], rows)
}

/** "09/2026" (the page's month) → "2026-09", safe in a file name. */
export function monthForFilename(month: string): string {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(month)
  return m ? `${m[2]}-${m[1].padStart(2, '0')}` : month.replace(/[^\w-]+/g, '-')
}

/** Browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
