'use client'

import React from 'react'
import MemberSettingsModal from '@/app/components/settings/MemberSettingsModal'

export const MEMBER_SETTINGS_LABEL = 'הגדרות חבר/ה'

interface TaxesMemberSettingsProps {
  user: { uid: string; email?: string | null } | null
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}

/**
 * Taxes page entry to the member settings modal for the signed-in member
 * (aglamazo#496). Same modal and save as Settings > household.
 */
export default function TaxesMemberSettings({ user, isOpen, onOpen, onClose }: TaxesMemberSettingsProps) {
  if (!user) return null
  return (
    <>
      <button type="button" className="file-picker" onClick={onOpen} style={{ marginInlineStart: 'auto' }}>
        {MEMBER_SETTINGS_LABEL}
      </button>
      <MemberSettingsModal isOpen={isOpen} onClose={onClose} userId={user.uid} memberLabel={user.email ?? undefined} />
    </>
  )
}
