import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BtlDisclaimer, { BTL_DISCLAIMER_SHORT, BTL_SITE_URL } from './BtlDisclaimer'

// aglamazo#498 (Agla 124308): the BTL site is the only source of truth for the
// National Insurance balance; Aglamazo's BTL figures are for convenience only.

describe('BtlDisclaimer (aglamazo#498)', () => {
  it('says the binding balance is only on the BTL site, links to it, and that the amounts are for convenience', () => {
    const html = renderToStaticMarkup(<BtlDisclaimer />)
    expect(html).toContain('היתרה המחייבת בביטוח לאומי (חוב, תשלומים וקנסות) מופיעה רק')
    expect(html).toContain(`href="${BTL_SITE_URL}"`)
    expect(html).toContain('באתר ביטוח לאומי')
    expect(html).toContain('הסכומים כאן מוצגים לנוחות בלבד')
  })

  it('the short form says the same in one line', () => {
    expect(BTL_DISCLAIMER_SHORT).toContain('לנוחות בלבד')
    expect(BTL_DISCLAIMER_SHORT).toContain('באתר ביטוח לאומי')
  })
})

describe('every place that shows a BTL payment, schedule or balance carries it (aglamazo#498 clause 1)', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')
  const count = (src: string, s: string) => src.split(s).length - 1

  it('member settings: the National Insurance advance block (monthly sum, notices, schedules, month overrides)', () => {
    const src = read('components/TaxProfileSection.tsx')
    expect(src).toMatch(/ביטוח לאומי \(סכום חודשי\)<\/span>\s*<BtlDisclaimer \/>/)
  })

  it('taxes page: the self-employed BTL table and the income-tax table (BTL paid column)', () => {
    const src = read('components/business/TaxSelfEmployedSections.tsx')
    expect(count(src, '<BtlDisclaimer />')).toBe(2)
    expect(src).toMatch(/ביטוח לאומי ובריאות — עצמאי — \{currentYear\}<\/h3>\s*<BtlDisclaimer \/>/)
  })

  it('todo: the BTL payment reminder card text', () => {
    const src = read('stores/todoStore.ts')
    expect(src).toMatch(/description: `\$\{expected\.toLocaleString\('he-IL'\)\} ₪ · עד .*\$\{BTL_DISCLAIMER_SHORT\}`/)
  })
})
