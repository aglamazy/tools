import type { ImportedFile } from '@/app/db/financeDB'
import type { FilePreview } from '@/app/types/file-preview'

export type FileStatus = 'fresh' | 'stale' | 'ready' | 'missing'

export type WizardFileEntry = {
  month: string // MM/YYYY
  fileType: 'bank' | 'credit-card'
  accountNumber?: string
  cardNumber?: string
  status: FileStatus
  importedFile?: ImportedFile
  folderFile?: FilePreview
  staleReason?: string
}

function parseMonth(monthStr: string): Date | null {
  const match = monthStr.match(/^(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  return new Date(parseInt(match[2]), parseInt(match[1]) - 1, 1)
}

function getMonthEnd(monthStr: string): Date | null {
  const d = parseMonth(monthStr)
  if (!d) return null
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
}

function getLastThreeMonths(now: Date): string[] {
  const months: string[] = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`)
  }
  return months
}

function isFresh(importedFile: ImportedFile, now: Date = new Date()): boolean {
  if (!importedFile.importedAt) return false
  const monthEnd = getMonthEnd(importedFile.processingMonth)
  if (!monthEnd) return false
  // Current/future month — always fresh (month hasn't ended yet)
  if (monthEnd >= now) return true
  // Past month — fresh only if imported after the month ended
  const importedAt = new Date(importedFile.importedAt)
  return importedAt > monthEnd
}

export function analyzeImportStatus(
  importedFiles: ImportedFile[],
  folderFiles: FilePreview[],
  now: Date = new Date()
): WizardFileEntry[] {
  const entries: WizardFileEntry[] = []

  // Collect known accounts and cards from both sources
  const bankAccounts = new Set<string>()
  const creditCards = new Set<string>()

  for (const f of [...importedFiles]) {
    if (f.fileType === 'bank' && f.accountNumber) bankAccounts.add(f.accountNumber)
    if (f.fileType === 'credit-card' && f.cardNumber) creditCards.add(f.cardNumber)
  }
  for (const f of folderFiles) {
    if (f.fileType === 'bank' && f.accountNumber) bankAccounts.add(f.accountNumber)
    if (f.fileType === 'credit-card' && f.cardNumber) creditCards.add(f.cardNumber)
  }

  // Build month range: last 3 months + all months from imported files and folder files
  const months = new Set(getLastThreeMonths(now))
  for (const f of importedFiles) {
    if (f.processingMonth) months.add(f.processingMonth)
  }
  for (const f of folderFiles) {
    if (f.processingMonth) months.add(f.processingMonth)
  }

  const sortedMonths = [...months].sort((a, b) => {
    const [am, ay] = a.split('/').map(Number)
    const [bm, by] = b.split('/').map(Number)
    return (by * 12 + bm) - (ay * 12 + am)
  })

  // Build entries for each month x account/card
  for (const month of sortedMonths) {
    for (const account of bankAccounts) {
      const imported = importedFiles.find(
        (f) => f.fileType === 'bank' && f.processingMonth === month && f.accountNumber === account
      )
      const folder = folderFiles.find(
        (f) => f.fileType === 'bank' && f.processingMonth === month && f.accountNumber === account
      )
      entries.push(buildEntry('bank', month, imported, folder, account, undefined, now))
    }

    for (const card of creditCards) {
      const imported = importedFiles.find(
        (f) => f.fileType === 'credit-card' && f.processingMonth === month && f.cardNumber === card
      )
      const folder = folderFiles.find(
        (f) => f.fileType === 'credit-card' && f.processingMonth === month && f.cardNumber === card
      )
      entries.push(buildEntry('credit-card', month, imported, folder, undefined, card, now))
    }
  }

  // Add folder files not covered by the grid above (e.g. unknown account/card)
  for (const f of folderFiles) {
    if (!f.processingMonth) continue
    const ft = f.fileType as 'bank' | 'credit-card'
    const covered = entries.some(
      (e) =>
        e.month === f.processingMonth &&
        e.fileType === ft &&
        ((ft === 'bank' && e.accountNumber === f.accountNumber) ||
          (ft === 'credit-card' && e.cardNumber === f.cardNumber))
    )
    if (!covered) {
      const imported = importedFiles.find(
        (imp) =>
          imp.fileType === ft &&
          imp.processingMonth === f.processingMonth &&
          ((ft === 'bank' && imp.accountNumber === f.accountNumber) ||
            (ft === 'credit-card' && imp.cardNumber === f.cardNumber))
      )
      entries.push(buildEntry(ft, f.processingMonth, imported, f, f.accountNumber || undefined, f.cardNumber || undefined, now))
    }
  }

  return entries
}

function buildEntry(
  fileType: 'bank' | 'credit-card',
  month: string,
  imported: ImportedFile | undefined,
  folder: FilePreview | undefined,
  accountNumber?: string,
  cardNumber?: string,
  now?: Date
): WizardFileEntry {
  if (imported) {
    if (isFresh(imported, now)) {
      return { month, fileType, accountNumber, cardNumber, status: 'fresh', importedFile: imported, folderFile: folder }
    }
    // Stale
    if (folder) {
      return { month, fileType, accountNumber, cardNumber, status: 'stale', importedFile: imported, folderFile: folder, staleReason: 'יובא לפני סוף החודש, קובץ חדש קיים' }
    }
    return { month, fileType, accountNumber, cardNumber, status: 'stale', importedFile: imported, staleReason: 'יובא לפני סוף החודש' }
  }
  if (folder) {
    return { month, fileType, accountNumber, cardNumber, status: 'ready', folderFile: folder }
  }
  return { month, fileType, accountNumber, cardNumber, status: 'missing' }
}
