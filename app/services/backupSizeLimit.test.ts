import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { backupSizeError, maxBackupBytes } from './backupSizeLimit'

describe('backup size limit by tier (aglamazo#458)', () => {
  it('owner has no limit', () => {
    expect(maxBackupBytes('owner')).toBe(Infinity)
    expect(backupSizeError(50 * 1024 * 1024, 'owner')).toBeNull()
  })

  it.each(['free', 'home', 'pro', undefined])('tier %s keeps the 2.5 MB limit', (tier) => {
    expect(maxBackupBytes(tier)).toBe(2621440)
    expect(backupSizeError(2621440, tier)).toBeNull()
    const err = backupSizeError(3 * 1024 * 1024, tier)
    expect(err).toContain('3.00 MB')
    expect(err).toContain('2.5 MB')
  })
})

describe('storage.rules size limit uses the uploader tier', () => {
  const rules = readFileSync(path.resolve(__dirname, '../../storage.rules'), 'utf8')
  const writeRules = rules.match(/allow write:[^;]*;/g) ?? []

  it('has the three backup write rules, each calling sizeAllowed()', () => {
    expect(writeRules).toHaveLength(3) // personal, households, shared
    for (const r of writeRules) expect(r).toContain('sizeAllowed()')
  })

  it('no write rule holds a bare size check outside sizeAllowed()', () => {
    for (const r of writeRules) expect(r).not.toContain('request.resource.size')
    const fn = rules.match(/function sizeAllowed\(\)\s*\{[^}]*\}/)?.[0]
    expect(fn).toContain("request.auth.token.get('tier', 'free') == 'owner'")
    expect(fn).toContain('request.resource.size < 2621440')
    const outside = rules.replace(fn!, '')
    expect(outside).not.toContain('request.resource.size')
  })
})
