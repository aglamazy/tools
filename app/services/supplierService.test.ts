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

// aglamazo#478: the real dev store holds the same bank alias on two supplier
// records (508 such aliases). renameSupplierAlias wrote to the FIRST holder
// while buildSupplierAliasMap displayed the LAST, so a rename looked unsaved.
describe('supplierService — rename/merge with a duplicated alias (aglamazo#478)', () => {
  const seed = (name: string, aliases: string[]) =>
    db.suppliers.add({ name, bankCardAliases: aliases, emailSenders: [], createdAt: '2026-07-13T12:00:00.000Z' })

  beforeEach(async () => { await db.suppliers.clear() })
  afterEach(async () => { await db.suppliers.clear() })

  it('Latin rename: "CLAUDE.AI SUBSCRIPTI" held by two records renames to "Claude Max" and displays it', async () => {
    await seed('קלוד מקס', ['CLAUDE.AI SUBSCRIPTI'])
    await seed('CLAUDE.AI SUBSCRIPTI', ['CLAUDE.AI SUBSCRIPTI'])
    await renameSupplierAlias('CLAUDE.AI SUBSCRIPTI', 'Claude Max')
    const map = await buildSupplierAliasMap()
    expect(map.get('claude.ai subscripti')).toBe('Claude Max')
    const holders = (await db.suppliers.toArray()).filter(s => s.bankCardAliases.includes('CLAUDE.AI SUBSCRIPTI'))
    expect(holders.map(s => s.name)).toEqual(['Claude Max'])
  })

  it('merge onto an existing name: "OPENAI *CHATGPT SU" (also on a stale record) joins "ChatGPT מנוי"', async () => {
    await seed('ChatGPT מנוי', ['OPENAI *CHATGPT SUBS'])
    await seed('OPENAI *CHATGPT SU', ['OPENAI *CHATGPT SU'])
    await seed('OPENAI *CHATGPT SU', ['OPENAI *CHATGPT SU']) // the duplicate
    await renameSupplierAlias('OPENAI *CHATGPT SU', 'ChatGPT מנוי')
    const map = await buildSupplierAliasMap()
    expect(map.get('openai *chatgpt su')).toBe('ChatGPT מנוי')
    expect(map.get('openai *chatgpt subs')).toBe('ChatGPT מנוי')
    const all = await db.suppliers.toArray()
    expect(all.filter(s => s.name === 'ChatGPT מנוי')).toHaveLength(1)
    expect(all.filter(s => s.name === 'OPENAI *CHATGPT SU')).toHaveLength(0)
  })

  it('Hebrew rename that already saved keeps showing: the most recently renamed holder wins over a stale seed', async () => {
    await db.suppliers.add({ name: 'OPENAI *CHATGPT SUBS', bankCardAliases: ['OPENAI *CHATGPT SUBS'], emailSenders: [], createdAt: '2026-10-18T18:24:37.558Z', updatedAt: '2026-10-18T18:24:37.558Z' })
    await db.suppliers.add({ name: 'ChatGPT מנוי', bankCardAliases: ['OPENAI *CHATGPT SUBS'], emailSenders: [], createdAt: '2026-11-04T00:00:00.000Z', updatedAt: '2026-11-14T17:03:52.807Z' })
    await db.suppliers.add({ name: 'OPENAI *CHATGPT SUBS', bankCardAliases: ['OPENAI *CHATGPT SUBS'], emailSenders: [], createdAt: '2026-11-10T08:11:54.996Z', updatedAt: '2026-11-10T08:11:54.996Z' })
    expect((await buildSupplierAliasMap()).get('openai *chatgpt subs')).toBe('ChatGPT מנוי')
    expect(await resolveSupplierDisplayName('OPENAI *CHATGPT SUBS')).toBe('ChatGPT מנוי')
  })
})
