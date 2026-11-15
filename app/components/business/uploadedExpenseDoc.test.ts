import { describe, it, expect } from 'vitest'
import { buildUploadedExpenseDoc } from './uploadedExpenseDoc'
import { groupExpenseDocsByTransaction } from './expenseScale'

// aglamazo#489 clause 3: Agla's two XPlace lines, one hand-uploaded file
// each. An upload through one line's control links to that line only.
describe('buildUploadedExpenseDoc (aglamazo#489)', () => {
  const lineA = 'tx-xplace-a'
  const lineB = 'tx-xplace-b'

  it('links the uploaded file to the line whose control was used, and no other', () => {
    const doc = buildUploadedExpenseDoc({
      transactionSyncId: lineA,
      fileName: 'xplace-invoice-256484.pdf',
      uploaded: { fileId: 'f1', webViewLink: 'https://drive/f1' },
      extracted: { vendor: 'XPlace', amount: 117, matchesTransaction: true },
    })
    const byTx = groupExpenseDocsByTransaction([doc])
    expect(byTx.get(lineA)?.map(d => d.fileName)).toEqual(['xplace-invoice-256484.pdf'])
    expect(byTx.get(lineB)).toBeUndefined()
  })

  it('two uploads on two lines: each line holds only its own file', () => {
    const a = buildUploadedExpenseDoc({ transactionSyncId: lineA, fileName: 'a.pdf', uploaded: { fileId: 'fa' }, extracted: {} })
    const b = buildUploadedExpenseDoc({ transactionSyncId: lineB, fileName: 'b.pdf', uploaded: { fileId: 'fb' }, extracted: {} })
    const byTx = groupExpenseDocsByTransaction([a, b])
    expect(byTx.get(lineA)?.map(d => d.fileName)).toEqual(['a.pdf'])
    expect(byTx.get(lineB)?.map(d => d.fileName)).toEqual(['b.pdf'])
  })
})
