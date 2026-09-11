import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/app/db/financeDB'
import { buildSupplierAliasMap, renameSupplierAlias, resolveSupplierDisplayName } from './supplierService'

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
})
