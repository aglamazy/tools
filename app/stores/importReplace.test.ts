import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, type ImportedFile } from '@/app/db/financeDB'
import { transactionStore } from './transactionStore'
import { replaceImportedFile } from './importedFileDeletion'

// aglamazo#503 — replace=yes must remove the old file and its transactions,
// then import (Agla 2026-11-04, msg 104808). On prod 603274e the old 79-row
// file stayed and the new one got only 4 rows: the new file's rows were
// deduped against the old file's identical rows.

const pay = (day: number, merchant: string, amount: number) => ({
  transactionDate: `2026-11-${String(day).padStart(2, '0')}`, merchant, amount, currentStep: 1, totalSteps: 1,
})

// File A: an earlier export of the month. File B: the full month, containing
// all of A's rows plus 2 more — the shape that dedup reduced to "new only".
const FILE_A = [pay(1, 'SHOP A', 100), pay(2, 'SHOP B', 50), pay(3, 'SHOP C', 75)]
const FILE_B = [...FILE_A, pay(4, 'SHOP D', 20), pay(5, 'חבר הצגות', -278)]

const sameCardMonth = (f: ImportedFile) => f.fileType === 'credit-card' && f.cardNumber === '1473' && f.processingMonth === '11/2026'

async function filesForMonth() {
  return ((await transactionStore.getImportedFiles())?.files ?? []).filter(sameCardMonth)
}

describe('import replace=yes (aglamazo#503)', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.importedFiles.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
    await db.importedFiles.clear()
  })

  it('leaves exactly the new file, none of the old rows, and all of the new rows', async () => {
    await transactionStore.saveCreditCardData('1473', FILE_A, '2026-11-10', '11/2026', 'A-1473_11_2026.xlsx')
    const [existing] = await filesForMonth()
    expect(existing.fileKey).toBe('A-1473_11_2026.xlsx')
    expect(existing.transactionCount).toBe(3)

    await replaceImportedFile(existing, () =>
      transactionStore.saveCreditCardData('1473', FILE_B, '2026-11-10', '11/2026', 'B-1473_11_2026.xlsx'),
    )

    const files = await filesForMonth()
    expect(files.map((f) => f.fileKey)).toEqual(['B-1473_11_2026.xlsx'])
    expect(await db.transactions.where('fileId').equals('A-1473_11_2026.xlsx').count()).toBe(0)
    expect(files[0].transactionCount).toBe(FILE_B.length)
  })

  it('without the replace step the new file is deduped down to its new rows (the prod defect)', async () => {
    await transactionStore.saveCreditCardData('1473', FILE_A, '2026-11-10', '11/2026', 'A-1473_11_2026.xlsx')
    await transactionStore.saveCreditCardData('1473', FILE_B, '2026-11-10', '11/2026', 'B-1473_11_2026.xlsx')
    const files = await filesForMonth()
    expect(files).toHaveLength(2)
    expect(files.find((f) => f.fileKey === 'B-1473_11_2026.xlsx')?.transactionCount).toBe(2)
  })
})
