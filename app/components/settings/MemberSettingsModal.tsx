'use client'

import React from 'react'
import Modal from '../Modal'
import TaxProfileSection from '@/app/components/TaxProfileSection'

interface MemberSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  memberLabel?: string
}

/**
 * The member settings modal ("הגדרות חבר/ה"): one member's tax profile
 * (dealer type, VAT period, National Insurance, income-tax advance).
 * Shared by Settings > household and the taxes page; the only save path is
 * TaxProfileSection -> saveTaxProfile(profile, userId).
 */
export default function MemberSettingsModal({ isOpen, onClose, userId, memberLabel }: MemberSettingsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="640px">
      <div className="modal-header">
        <h2>הגדרות חבר/ה</h2>
      </div>
      <div className="modal-body">
        {isOpen && <TaxProfileSection userId={userId} memberLabel={memberLabel} />}
      </div>
    </Modal>
  )
}
