import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { YpayDocType } from '@/app/services/ypayService'
import {
  parseYpayIncomeExportRows,
  buildYpayDocumentFromImportRow,
  importYpayIncomeRows,
} from './ypayIncomeImportService'

// aglamazo#381, Agla 2026-09-14: real "ארכיון הכנסות" export from ypay's
// dashboard (income (2).xls, 01/06/2026-31/08/2026). Rows reproduced
// verbatim from the actual file. Row shape confirmed live: metadata rows
// (export date, business name, business id, report title, date range),
// then a header row, then data. Agla's explicit instruction, by doc-type
// label: import חשבונית מס (106) and חשבונית מס קבלה (109); ignore חשבונית
// מס זיכוי (107, credit note) and קבלה (108, plain receipt).

const REAL_EXPORT_ROWS: unknown[][] = [
  ['14/09/2026'],
  ["בית העסק: יעקב אגלמז"],
  ["מס' עוסק: 012680286"],
  ['ארכיון הכנסות'],
  ['לתאריכים: 01/06/2026 עד 31/08/2026'],
  ['אסמכתא', 'סוג מסמך', 'תאריך', 'לקוח', 'מזהה לקוח', 'לפני מע"מ', 'מע"מ', 'אחרי מע"מ', "מס' הקצאה"],
  ['900000', 'חשבונית מס קבלה', '22/06/2026', 'אימפורטה', '517166922', '3898.28', '701.69', '4599.97'],
  ['600000', 'חשבונית מס זיכוי', '22/06/2026', 'אימפורטה', '517166922', '-3898.28', '-701.69', '-4599.97'],
  ['800013', 'קבלה', '22/06/2026', 'אימפורטה', '517166922', '4599.97', '827.99', '4599.97'],
  ['700005', 'חשבונית מס', '29/06/2026', 'אילן עוז', null, '3000', '540', '3540'],
  ['700006', 'חשבונית מס', '29/06/2026', 'אלרון קאר ח.ר בע״מ', '513074500', '2900', '522', '3422'],
  ['900001', 'חשבונית מס קבלה', '29/06/2026', 'בדיקות', '012680286', '0.85', '0.15', '1'],
  ['900002', 'חשבונית מס קבלה', '29/06/2026', 'בדיקות', '012680286', '0.85', '0.15', '1'],
  ['700007', 'חשבונית מס', '03/07/2026', 'אימפורטה', '517166922', '3534.12', '636.14', '4170.26'],
  ['800014', 'קבלה', '13/07/2026', 'אילן עוז', null, '1652', '297.36', '1652'],
  ['800015', 'קבלה', '13/07/2026', 'אלרון קאר ח.ר בע״מ', '513074500', '4130', '743.4', '4130'],
  ['800016', 'קבלה', '13/07/2026', 'אילן עוז', null, '6550', '1179', '6550'],
  ['900003', 'חשבונית מס קבלה', '10/08/2026', 'אילן עוז', null, '1120', '201.6', '1321.6'],
  [],
]

describe('parseYpayIncomeExportRows', () => {
  it('finds the header row past the metadata rows and parses only the importable types', () => {
    const { imported, ignoredCount } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    // 12 data rows total: 7 are חשבונית מס / חשבונית מס קבלה (imported), 5 are
    // חשבונית מס זיכוי / קבלה (ignored).
    expect(imported.map((r) => r.serialNumber)).toEqual([
      '900000', '700005', '700006', '900001', '900002', '700007', '900003',
    ])
    expect(ignoredCount).toBe(5) // 600000 (זיכוי) + 800013/800014/800015/800016 (קבלה)
  })

  it('parses the real #900003 row exactly (the aglamazo#380 case)', () => {
    const { imported } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    const row = imported.find((r) => r.serialNumber === '900003')!
    expect(row.docType).toBe(YpayDocType.TaxInvoiceReceipt)
    expect(row.date).toBe('2026-08-10')
    expect(row.netAmount).toBe(1120)
    expect(row.vatAmount).toBe(201.6)
    expect(row.grossAmount).toBe(1321.6)
    expect(row.customerName).toBe('אילן עוז')
  })

  it('flags negative amounts on a credit note as ignored, not imported as negative income', () => {
    const { imported } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    expect(imported.some((r) => r.serialNumber === '600000')).toBe(false)
  })

  it('throws a clear error when the header row is missing', () => {
    expect(() => parseYpayIncomeExportRows([['not', 'a', 'real', 'export']])).toThrow(/אסמכתא/)
  })
})

describe('buildYpayDocumentFromImportRow', () => {
  beforeEach(async () => {
    await db.transactions.clear()
    await db.subjects.clear()
    await db.projects.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
    await db.subjects.clear()
    await db.projects.clear()
  })

  it('stores the NET amount for חשבונית מס (106), unlinked when no matching transaction exists', async () => {
    const row = { serialNumber: '700007', docType: YpayDocType.TaxInvoice, date: '2026-07-03', customerName: 'אימפורטה', netAmount: 3534.12, vatAmount: 636.14, grossAmount: 4170.26 }
    const doc = await buildYpayDocumentFromImportRow(row)
    expect(doc.amount).toBe(3534.12)
    expect(doc.transactionId).toBe('ypay-import:700007')
  })

  it('stores the GROSS amount for חשבונית מס קבלה (109)', async () => {
    const row = { serialNumber: '900003', docType: YpayDocType.TaxInvoiceReceipt, date: '2026-08-10', customerName: 'אילן עוז', netAmount: 1120, vatAmount: 201.6, grossAmount: 1321.6 }
    const doc = await buildYpayDocumentFromImportRow(row)
    expect(doc.amount).toBe(1321.6)
  })

  it('links to a matching income transaction instead of a synthetic id (aglamazo#381: "incomes should go into existing business")', async () => {
    await db.subjects.add({ id: 'cat-1', name: 'הכנסות ייעוץ', type: 'income', businessId: 'biz-1' } as any)
    await db.transactions.add({
      type: 'income', date: '2026-08-10', amount: 1321.6, description: 'אילן עוז',
      category: 'הכנסות ייעוץ', syncId: 'tx-sync-900003', isFixed: false, month: '08/2026',
    } as any)
    const row = { serialNumber: '900003', docType: YpayDocType.TaxInvoiceReceipt, date: '2026-08-10', customerName: 'אילן עוז', netAmount: 1120, vatAmount: 201.6, grossAmount: 1321.6 }
    const doc = await buildYpayDocumentFromImportRow(row)
    expect(doc.transactionId).toBe('tx-sync-900003')
  })

  it('falls back to the synthetic id when a candidate transaction is not an income category', async () => {
    await db.subjects.add({ id: 'cat-2', name: 'ציוד', type: 'expense', businessId: 'biz-1' } as any)
    await db.transactions.add({
      type: 'expense', date: '2026-08-10', amount: 1321.6, description: 'לא רלוונטי',
      category: 'ציוד', syncId: 'tx-sync-999', isFixed: false, month: '08/2026',
    } as any)
    const row = { serialNumber: '900003', docType: YpayDocType.TaxInvoiceReceipt, date: '2026-08-10', customerName: 'אילן עוז', netAmount: 1120, vatAmount: 201.6, grossAmount: 1321.6 }
    const doc = await buildYpayDocumentFromImportRow(row)
    expect(doc.transactionId).toBe('ypay-import:900003')
  })

  it('falls back to the synthetic id when two income transactions match ambiguously', async () => {
    await db.subjects.add({ id: 'cat-1', name: 'הכנסות ייעוץ', type: 'income', businessId: 'biz-1' } as any)
    await db.transactions.add({ type: 'income', date: '2026-08-10', amount: 1321.6, description: 'a', category: 'הכנסות ייעוץ', syncId: 'tx-a', isFixed: false, month: '08/2026' } as any)
    await db.transactions.add({ type: 'income', date: '2026-08-11', amount: 1321.6, description: 'b', category: 'הכנסות ייעוץ', syncId: 'tx-b', isFixed: false, month: '08/2026' } as any)
    const row = { serialNumber: '900003', docType: YpayDocType.TaxInvoiceReceipt, date: '2026-08-10', customerName: 'אילן עוז', netAmount: 1120, vatAmount: 201.6, grossAmount: 1321.6 }
    const doc = await buildYpayDocumentFromImportRow(row)
    expect(doc.transactionId).toBe('ypay-import:900003')
  })

  it('attributes an unpaid invoice by CUSTOMER->project match, with no transaction needed (Agla\'s direct question, aglamazo#381)', async () => {
    await db.projects.add({ businessId: 'biz-1', name: 'אילן עוז', archived: false, createdAt: '', updatedAt: '' } as any)
    const row = { serialNumber: '700005', docType: YpayDocType.TaxInvoice, date: '2026-06-29', customerName: 'אילן עוז', netAmount: 3000, vatAmount: 540, grossAmount: 3540 }
    const doc = await buildYpayDocumentFromImportRow(row)
    expect(doc.projectName).toBe('אילן עוז')
    expect(doc.transactionId).toBe('ypay-import:700005') // still synthetic — attribution comes from projectName instead
  })

  it('leaves projectName unset when the customer name matches no project (still falls back to unmatched, not a guess)', async () => {
    const row = { serialNumber: '700005', docType: YpayDocType.TaxInvoice, date: '2026-06-29', customerName: 'לקוח שלא קיים כפרויקט', netAmount: 3000, vatAmount: 540, grossAmount: 3540 }
    const doc = await buildYpayDocumentFromImportRow(row)
    expect(doc.projectName).toBeUndefined()
  })

  it('leaves projectName unset when two projects share the same customer name (ambiguous, not guessed)', async () => {
    await db.projects.add({ businessId: 'biz-1', name: 'אילן עוז', archived: false, createdAt: '', updatedAt: '' } as any)
    await db.projects.add({ businessId: 'biz-2', name: 'אילן עוז', archived: false, createdAt: '', updatedAt: '' } as any)
    const row = { serialNumber: '700005', docType: YpayDocType.TaxInvoice, date: '2026-06-29', customerName: 'אילן עוז', netAmount: 3000, vatAmount: 540, grossAmount: 3540 }
    const doc = await buildYpayDocumentFromImportRow(row)
    expect(doc.projectName).toBeUndefined()
  })
})

describe('importYpayIncomeRows', () => {
  beforeEach(async () => {
    await db.ypayDocuments.clear()
    await db.transactions.clear()
    await db.subjects.clear()
    await db.projects.clear()
  })
  afterEach(async () => {
    await db.ypayDocuments.clear()
    await db.transactions.clear()
    await db.subjects.clear()
    await db.projects.clear()
  })

  it('adds a genuinely new document, unlinked (no matching transaction imported yet)', async () => {
    const { imported, ignoredCount } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    const summary = await importYpayIncomeRows(imported, ignoredCount)
    expect(summary.added).toBe(7)
    expect(summary.ignoredType).toBe(5)
    expect(summary.unmatchedCount).toBe(7)
    const stored = await db.ypayDocuments.filter((d) => d.serialNumber === '900003').first()
    expect(stored?.amount).toBe(1321.6)
    expect(stored?.transactionId).toBe('ypay-import:900003')
  })

  it('links a new document to its real bank transaction when one already exists (aglamazo#381 fix)', async () => {
    await db.subjects.add({ id: 'cat-1', name: 'הכנסות ייעוץ', type: 'income', businessId: 'biz-1' } as any)
    await db.transactions.add({
      type: 'income', date: '2026-08-10', amount: 1321.6, description: 'אילן עוז',
      category: 'הכנסות ייעוץ', syncId: 'tx-sync-900003', isFixed: false, month: '08/2026',
    } as any)
    const { imported, ignoredCount } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    const summary = await importYpayIncomeRows(imported, ignoredCount)
    expect(summary.unmatchedCount).toBe(6) // one fewer than the fully-unmatched case above
    const stored = await db.ypayDocuments.filter((d) => d.serialNumber === '900003').first()
    expect(stored?.transactionId).toBe('tx-sync-900003')
  })

  it('re-links an already-imported orphaned row once its matching transaction is imported (the real Agla case)', async () => {
    // Simulates the exact live sequence: the ypay file was imported FIRST
    // (before the matching bank transaction existed locally), leaving a
    // synthetic, business-unattributed transactionId. Re-running the same
    // import after the bank statement is imported should pick up the match.
    await db.ypayDocuments.add({
      transactionId: 'ypay-import:900003',
      url: '',
      serialNumber: '900003',
      docType: YpayDocType.TaxInvoiceReceipt,
      amount: 1321.6,
      createdAt: '2026-08-10T00:00:00.000Z',
    })
    await db.subjects.add({ id: 'cat-1', name: 'הכנסות ייעוץ', type: 'income', businessId: 'biz-1' } as any)
    await db.transactions.add({
      type: 'income', date: '2026-08-10', amount: 1321.6, description: 'אילן עוז',
      category: 'הכנסות ייעוץ', syncId: 'tx-sync-900003', isFixed: false, month: '08/2026',
    } as any)
    const { imported, ignoredCount } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    const summary = await importYpayIncomeRows(imported, ignoredCount)
    expect(summary.repaired).toBeGreaterThanOrEqual(1)
    const stored = await db.ypayDocuments.filter((d) => d.serialNumber === '900003').first()
    expect(stored?.transactionId).toBe('tx-sync-900003')
    expect(stored?.amount).toBe(1321.6) // untouched — already correct
  })

  it('repairs an existing stub (no amount) instead of skipping it (the real #380 case)', async () => {
    await db.ypayDocuments.add({
      transactionId: 'linked-tx-syncid',
      url: '',
      serialNumber: '900003',
      docType: YpayDocType.TaxInvoiceReceipt,
      createdAt: '2026-09-07T17:14:32.990Z', // the wrong, sync-time date from #380
    })
    const { imported, ignoredCount } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    const summary = await importYpayIncomeRows(imported, ignoredCount)
    expect(summary.repaired).toBe(1)
    expect(summary.added).toBe(6)
    const stored = await db.ypayDocuments.filter((d) => d.serialNumber === '900003').first()
    expect(stored?.amount).toBe(1321.6)
    expect(stored?.createdAt).toBe(new Date('2026-08-10').toISOString())
    expect(stored?.transactionId).toBe('linked-tx-syncid') // untouched
  })

  it('never overwrites an existing document that already has a real amount', async () => {
    await db.ypayDocuments.add({
      transactionId: '',
      url: 'https://real-url',
      serialNumber: '900003',
      docType: YpayDocType.TaxInvoiceReceipt,
      amount: 9999, // deliberately different from the export, to prove it's untouched
      createdAt: '2026-08-10T00:00:00.000Z',
    })
    const { imported, ignoredCount } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    const summary = await importYpayIncomeRows(imported, ignoredCount)
    expect(summary.alreadyCorrect).toBe(1)
    expect(summary.added).toBe(6)
    const stored = await db.ypayDocuments.filter((d) => d.serialNumber === '900003').first()
    expect(stored?.amount).toBe(9999)
  })

  it('flags בדיקות rows without excluding them', async () => {
    const { imported, ignoredCount } = parseYpayIncomeExportRows(REAL_EXPORT_ROWS)
    const summary = await importYpayIncomeRows(imported, ignoredCount)
    expect(summary.possibleTestRows.sort()).toEqual(['900001', '900002'])
    const stored = await db.ypayDocuments.filter((d) => d.serialNumber === '900001').first()
    expect(stored).toBeDefined()
  })
})
