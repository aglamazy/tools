'use client'

import Modal from './Modal'

type YesNoModalProps = {
  isOpen: boolean
  question: string
  yesText?: string
  noText?: string
  onYes: () => void
  onNo: () => void
}

export default function YesNoModal({
  isOpen,
  question,
  yesText = 'כן',
  noText = 'לא',
  onYes,
  onNo
}: YesNoModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onNo} maxWidth="400px" showCloseButton={false}>
      <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ fontSize: '1.125rem', margin: '0 0 1.5rem 0' }}>
          {question}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={onYes}
            className="file-picker"
            style={{ flex: 1 }}
            autoFocus
          >
            <span>{yesText}</span>
          </button>
          <button
            onClick={onNo}
            className="upload-another-btn"
            style={{ flex: 1 }}
          >
            {noText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
