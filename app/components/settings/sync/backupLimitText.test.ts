import { describe, expect, it } from 'vitest'
import { backupSizeLimitSuffix, storageLimitNote } from './backupLimitText'

describe('sync card size-limit text by tier (aglamazo#461)', () => {
  it('owner sees no 2.5 MB text', () => {
    expect(backupSizeLimitSuffix('owner')).toBe('')
    expect(storageLimitNote('owner', false)).not.toContain('2.5 MB')
    expect(storageLimitNote('owner', true)).not.toContain('2.5 MB')
  })

  it('free (and no tier claim) sees the 2.5 MB limit', () => {
    expect(backupSizeLimitSuffix('free')).toBe(' / 2.5 MB')
    expect(backupSizeLimitSuffix(undefined)).toBe(' / 2.5 MB')
    expect(storageLimitNote('free', false)).toContain('מגבלת אחסון בחינם: 2.5 MB')
  })

  it('tier still loading shows no limit yet', () => {
    expect(backupSizeLimitSuffix(null)).toBe('')
    expect(storageLimitNote(null, false)).not.toContain('MB')
  })
})
