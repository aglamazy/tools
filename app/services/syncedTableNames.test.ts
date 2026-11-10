import { describe, it, expect } from 'vitest'
import { db } from '@/app/db/financeDB'
import { SYNCED_DB_TABLES, DEVICE_LOCAL_DB_TABLES } from './syncedTableNames'

/** FinanceDB tables listed in neither SYNCED_DB_TABLES nor DEVICE_LOCAL_DB_TABLES. */
function unlisted(tableNames: string[]): string[] {
  const listed = new Set<string>([...SYNCED_DB_TABLES, ...DEVICE_LOCAL_DB_TABLES])
  return tableNames.filter((n) => !listed.has(n))
}

describe('every FinanceDB table is synced or named device-local (aglamazo#472)', () => {
  const tableNames = db.tables.map((t) => t.name)

  it('no table is in neither list', () => {
    expect(tableNames.length).toBeGreaterThan(20)
    expect(unlisted(tableNames)).toEqual([])
  })

  it('the guard fails for a table that is in neither list', () => {
    // What the 4 tables looked like before the fix: in the schema, in no list.
    expect(unlisted([...tableNames, 'newTableNobodyListed'])).toEqual(['newTableNobodyListed'])
  })

  it('no list names a table that does not exist, and none is in both', () => {
    const real = new Set(tableNames)
    expect([...SYNCED_DB_TABLES, ...DEVICE_LOCAL_DB_TABLES].filter((n) => !real.has(n))).toEqual([])
    expect(SYNCED_DB_TABLES.filter((n) => (DEVICE_LOCAL_DB_TABLES as readonly string[]).includes(n))).toEqual([])
  })

  it('students, profileQAs, scoutConfigs, scoutResults are synced', () => {
    for (const t of 'students profileQAs scoutConfigs scoutResults'.split(' ')) {
      expect(SYNCED_DB_TABLES).toContain(t)
    }
  })
})
