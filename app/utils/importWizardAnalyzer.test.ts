import { describe, it, expect } from 'vitest'
import { analyzeImportStatus } from './importWizardAnalyzer'
import type { ImportedFile } from '@/app/db/financeDB'
import { FileType } from '@/app/types/file-type'

// aglamazo#353: a card/account that's been marked not-tracked must stop
// generating "missing" entries every month, forever — that permanently-red
// row is exactly what let three real months of missing card transactions
// stay invisible (the warning surface was already noisy).

function creditFile(overrides: Partial<ImportedFile> = {}): ImportedFile {
  return {
    fileType: 'credit-card',
    fileName: 'test.pdf',
    processingMonth: '06/2026',
    cardNumber: '2075',
    transactionCount: 1,
    importedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('analyzeImportStatus — not-tracked accounts (aglamazo#353)', () => {
  it('a not-tracked card generates no entries at all, even though it appears in imported history', () => {
    const now = new Date('2026-09-15')
    const importedFiles = [creditFile()]
    const entries = analyzeImportStatus(importedFiles, [], now, new Set(['card:2075']))
    expect(entries.some((e) => e.cardNumber === '2075')).toBe(false)
  })

  it('without the not-tracked flag, the same card generates a missing entry for later months', () => {
    const now = new Date('2026-09-15')
    const importedFiles = [creditFile()]
    const entries = analyzeImportStatus(importedFiles, [], now, new Set())
    const septemberEntry = entries.find((e) => e.cardNumber === '2075' && e.month === '09/2026')
    expect(septemberEntry?.status).toBe('missing')
  })

  it('marking one card not-tracked does not suppress a different tracked card', () => {
    const now = new Date('2026-09-15')
    const importedFiles = [creditFile({ cardNumber: '2075' }), creditFile({ cardNumber: '1473' })]
    const entries = analyzeImportStatus(importedFiles, [], now, new Set(['card:2075']))
    expect(entries.some((e) => e.cardNumber === '2075')).toBe(false)
    expect(entries.some((e) => e.cardNumber === '1473' && e.month === '09/2026')).toBe(true)
  })

  it('a not-tracked card whose file DOES show up in the folder is still importable, not hidden', () => {
    const now = new Date('2026-09-15')
    const importedFiles = [creditFile({ cardNumber: '2075' })]
    const folderFiles = [{
      fileName: '2075_09_2026.pdf',
      fileType: FileType.CreditCard,
      processingMonth: '09/2026',
      cardNumber: '2075',
      accountNumber: null,
      transactionCount: 3,
      lastModified: Date.now(),
      fileHandle: {} as FileSystemFileHandle,
    }]
    const entries = analyzeImportStatus(importedFiles, folderFiles, now, new Set(['card:2075']))
    const septemberEntry = entries.find((e) => e.cardNumber === '2075' && e.month === '09/2026')
    expect(septemberEntry?.status).toBe('ready')
  })
})
