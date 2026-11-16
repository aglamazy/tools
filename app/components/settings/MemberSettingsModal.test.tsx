import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// aglamazo#496: the member settings modal opens from the taxes page too.
// TaxProfileSection is mocked to a marker carrying the uid it was given,
// so the tests see which member's profile the modal loads and saves.
vi.mock('@/app/components/TaxProfileSection', () => ({
  default: ({ userId, memberLabel }: { userId?: string; memberLabel?: string }) =>
    <div data-testid="tax-profile" data-uid={userId} data-label={memberLabel} />,
}))

import MemberSettingsModal from './MemberSettingsModal'
import TaxesMemberSettings, { MEMBER_SETTINGS_LABEL } from '@/app/components/business/TaxesMemberSettings'

const user = { uid: 'uid-agla', email: 'member@example.com' }
const noop = () => {}

describe('MemberSettingsModal (aglamazo#496)', () => {
  it('when open renders the heading and TaxProfileSection for the given userId', () => {
    const html = renderToStaticMarkup(<MemberSettingsModal isOpen onClose={noop} userId="uid-1" memberLabel="a@b.c" />)
    expect(html).toContain('<h2>הגדרות חבר/ה</h2>')
    expect(html).toContain('data-uid="uid-1"')
    expect(html).toContain('data-label="a@b.c"')
  })

  it('when closed renders nothing', () => {
    expect(renderToStaticMarkup(<MemberSettingsModal isOpen={false} onClose={noop} userId="uid-1" />)).toBe('')
  })
})

describe('Taxes page member settings control (aglamazo#496)', () => {
  it('a signed-in member sees the button; the modal is closed until it is clicked', () => {
    const html = renderToStaticMarkup(<TaxesMemberSettings user={user} isOpen={false} onOpen={noop} onClose={noop} />)
    expect(html).toContain(`>${MEMBER_SETTINGS_LABEL}</button>`)
    expect(html).not.toContain('data-testid="tax-profile"')
  })

  it('no signed-in user: no button', () => {
    expect(renderToStaticMarkup(<TaxesMemberSettings user={null} isOpen={false} onOpen={noop} onClose={noop} />)).toBe('')
  })

  it('clicking the button calls onOpen; open shows the modal with the signed-in user uid', () => {
    const onOpen = vi.fn()
    const tree = TaxesMemberSettings({ user, isOpen: false, onOpen, onClose: noop }) as React.ReactElement<{ children: React.ReactElement[] }>
    const button = React.Children.toArray(tree.props.children).find(
      (c): c is React.ReactElement<{ onClick: () => void }> => React.isValidElement(c) && c.type === 'button',
    )
    expect(button).toBeDefined()
    button!.props.onClick()
    expect(onOpen).toHaveBeenCalledTimes(1)

    const html = renderToStaticMarkup(<TaxesMemberSettings user={user} isOpen onOpen={noop} onClose={noop} />)
    expect(html).toContain('<h2>הגדרות חבר/ה</h2>')
    expect(html).toContain('data-uid="uid-agla"')
    expect(html).toContain('data-label="member@example.com"')
  })
})

describe('one modal, one save path on both pages (aglamazo#496 clause 2)', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8')

  it('HouseholdTab opens the shared MemberSettingsModal from its member row, with no inline copy', () => {
    const src = read('components/settings/HouseholdTab.tsx')
    expect(src).toContain("import MemberSettingsModal from './MemberSettingsModal'")
    expect(src).toMatch(/onClick=\{\(\) => setMemberSettings\(\{ uid: memberId/)
    expect(src).toMatch(/<MemberSettingsModal[\s\S]*?userId=\{memberSettings\?\.uid/)
    expect(src).not.toContain('TaxProfileSection')
  })

  it('TaxesTab renders the shared control, which renders the same MemberSettingsModal', () => {
    expect(read('components/business/TaxesTab.tsx')).toContain('<TaxesMemberSettings')
    expect(read('components/business/TaxesMemberSettings.tsx')).toContain(
      "import MemberSettingsModal from '@/app/components/settings/MemberSettingsModal'",
    )
  })
})
