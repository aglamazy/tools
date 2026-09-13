import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { transactionStore } from './transactionStore'

// aglamazo#371: dedup ran card-vs-card and bank-vs-bank only — nothing
// compared a bank-sourced row against a card-sourced row, so a bank export
// that itemizes card-level lines (some FIBI exports do) could land the same
// real charge twice. Covers the two shapes isCrossFeedDuplicate.test.ts
// proved isCrossFeedDuplicate actually catches (exact match, truncation) —
// the reciprocal direction (import order: card first, then bank) is
// exercised by saveBankTransactions' test; saveCreditCardData's own test
// covers card-imported-after-bank.

describe('cross-feed dedup (aglamazo#371)', () => {
  beforeEach(async () => {
    await db.transactions.clear()
  })
  afterEach(async () => {
    await db.transactions.clear()
  })

  it('saveBankTransactions skips a row that duplicates an existing credit-card charge', async () => {
    await db.transactions.add({
      type: 'credit',
      date: '2026-06-10',
      amount: -517.69,
      description: 'ANTHROPIC* CLAUDE SUB',
      merchant: 'ANTHROPIC* CLAUDE SUB',
      cardNumber: '1234',
      isFixed: false,
      month: '06/2026',
      importedAt: new Date().toISOString(),
      fileId: 'card-file',
    } as any)

    const ok = await transactionStore.saveBankTransactions(
      '06/2026',
      [{ date: '2026-06-10', amount: -517.69, description: 'ANTHROPIC* CLAUDE SU', isFixed: false }],
      'acc-1',
      'bank-file'
    )
    expect(ok).toBe(true)
    const bankRows = await db.transactions.where('type').equals('bank').toArray()
    expect(bankRows).toHaveLength(0)
  })

  it('saveBankTransactions keeps a genuinely different same-day/same-amount row', async () => {
    await db.transactions.add({
      type: 'credit',
      date: '2026-06-10',
      amount: -517.69,
      description: 'PELEPHONE',
      merchant: 'PELEPHONE',
      cardNumber: '1234',
      isFixed: false,
      month: '06/2026',
      importedAt: new Date().toISOString(),
      fileId: 'card-file',
    } as any)

    const ok = await transactionStore.saveBankTransactions(
      '06/2026',
      [{ date: '2026-06-10', amount: -517.69, description: 'ANTHROPIC* CLAUDE SU', isFixed: false }],
      'acc-1',
      'bank-file'
    )
    expect(ok).toBe(true)
    const bankRows = await db.transactions.where('type').equals('bank').toArray()
    expect(bankRows).toHaveLength(1)
  })

  it('saveCreditCardData skips a payment that duplicates an existing bank row', async () => {
    await db.transactions.add({
      type: 'bank',
      date: '2026-06-10',
      amount: -517.69,
      description: 'ANTHROPIC* CLAUDE SU',
      accountNumber: 'acc-1',
      isFixed: false,
      month: '06/2026',
      importedAt: new Date().toISOString(),
      fileId: 'bank-file',
    } as any)

    const ok = await transactionStore.saveCreditCardData(
      '1234',
      [{ transactionDate: '2026-06-10', amount: 517.69, merchant: 'ANTHROPIC* CLAUDE SUB' }],
      '2026-06-10',
      '06/2026',
      'card-file'
    )
    expect(ok).toBe(true)
    const cardRows = await db.transactions.where('type').equals('credit').toArray()
    expect(cardRows).toHaveLength(0)
  })

  it('saveCreditCardData keeps a genuinely different same-day/same-amount payment', async () => {
    await db.transactions.add({
      type: 'bank',
      date: '2026-06-10',
      amount: -517.69,
      description: 'PELEPHONE',
      accountNumber: 'acc-1',
      isFixed: false,
      month: '06/2026',
      importedAt: new Date().toISOString(),
      fileId: 'bank-file',
    } as any)

    const ok = await transactionStore.saveCreditCardData(
      '1234',
      [{ transactionDate: '2026-06-10', amount: 517.69, merchant: 'ANTHROPIC* CLAUDE SUB' }],
      '2026-06-10',
      '06/2026',
      'card-file'
    )
    expect(ok).toBe(true)
    const cardRows = await db.transactions.where('type').equals('credit').toArray()
    expect(cardRows).toHaveLength(1)
  })
})
