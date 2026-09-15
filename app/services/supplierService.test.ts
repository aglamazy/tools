import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { bindSupplierToExisting, buildSupplierAliasMap, renameSupplierAlias, resolveOrCreateSupplier, resolveSupplierDisplayName } from './supplierService'

// Regression coverage for aglamazo#342's rename mechanics — the part of the
// pen-icon feature that isn't tied to a React render (component tests aren't
// set up in this repo; see ExpenseMonthSupplierPivot.tsx for the UI side).

describe('supplierService — alias rename (aglamazo#342)', () => {
  beforeEach(async () => {
    await db.suppliers.clear()
  })

  afterEach(async () => {
    await db.suppliers.clear()
  })

  it('renameSupplierAlias creates a supplier record for a raw value that has none yet', async () => {
    await renameSupplierAlias('VERCEL MKT NEON', 'Vercel')
    expect(await resolveSupplierDisplayName('VERCEL MKT NEON')).toBe('Vercel')
  })

  it('renaming two different raw values to the same name makes both resolve to it', async () => {
    await renameSupplierAlias('VERCEL INC.', 'Vercel')
    await renameSupplierAlias('VERCEL MKT NEON', 'Vercel')
    expect(await resolveSupplierDisplayName('VERCEL INC.')).toBe('Vercel')
    expect(await resolveSupplierDisplayName('VERCEL MKT NEON')).toBe('Vercel')
  })

  it('resolveSupplierDisplayName falls back to the raw value when no alias exists', async () => {
    expect(await resolveSupplierDisplayName('Some Unknown Vendor')).toBe('Some Unknown Vendor')
  })

  it('buildSupplierAliasMap is case-insensitive and covers every known alias', async () => {
    await renameSupplierAlias('VERCEL INC.', 'Vercel')
    const map = await buildSupplierAliasMap()
    expect(map.get('vercel inc.')).toBe('Vercel')
  })

  it('renaming an already-renamed alias again updates it, not duplicates it', async () => {
    await renameSupplierAlias('VERCEL INC.', 'Vercel')
    await renameSupplierAlias('VERCEL INC.', 'Vercel Inc.')
    expect(await resolveSupplierDisplayName('VERCEL INC.')).toBe('Vercel Inc.')
    expect(await db.suppliers.count()).toBe(1)
  })

  it('renaming a bare alias to a name that already exists merges into it instead of creating a same-name duplicate (2026-09-15 Celcom bug)', async () => {
    const existingId = await db.suppliers.add({
      name: 'סלקום ישראל בע"מ',
      bankCardAliases: ['סלקום ישראל בע"מ'],
      emailSenders: ['cellcom-monthly-invoice@cellcominv.co.il'],
      createdAt: new Date().toISOString(),
    })
    await renameSupplierAlias('סלקום', 'סלקום ישראל בע"מ')

    expect(await db.suppliers.count()).toBe(1)
    const merged = await db.suppliers.get(existingId)
    expect(merged?.emailSenders).toEqual(['cellcom-monthly-invoice@cellcominv.co.il'])
    expect(merged?.bankCardAliases).toEqual(expect.arrayContaining(['סלקום ישראל בע"מ', 'סלקום']))
  })
})

describe('supplierService — bindSupplierToExisting (aglamazo, 2026-09-15)', () => {
  beforeEach(async () => {
    await db.suppliers.clear()
  })

  afterEach(async () => {
    await db.suppliers.clear()
  })

  it('folds the sender-less supplier into the one with a working email sender and deletes the source', async () => {
    const target = await resolveOrCreateSupplier('סלקום ישראל בע"מ')
    await db.suppliers.update(target.id!, { emailSenders: ['cellcom-monthly-invoice@cellcominv.co.il'] })
    const source = await resolveOrCreateSupplier('סלקום')

    const result = await bindSupplierToExisting(source.id!, target.id!)

    expect(result.emailSenders).toEqual(['cellcom-monthly-invoice@cellcominv.co.il'])
    expect(result.bankCardAliases).toEqual(expect.arrayContaining(['סלקום ישראל בע"מ', 'סלקום']))
    expect(await db.suppliers.get(source.id!)).toBeUndefined()
    expect(await resolveSupplierDisplayName('סלקום')).toBe('סלקום ישראל בע"מ')
  })

  it('refuses to bind a supplier to itself', async () => {
    const s = await resolveOrCreateSupplier('Vercel')
    await expect(bindSupplierToExisting(s.id!, s.id!)).rejects.toThrow()
  })
})
