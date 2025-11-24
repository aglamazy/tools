'use client'

import Modal from './Modal'

type MessageModalProps = {
  isOpen: boolean
  emoji?: string
  message: string
  onClose: () => void
}

export default function MessageModal({ isOpen, emoji, message, onClose }: MessageModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="400px" showCloseButton={false}>
      <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
        {emoji && (
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {emoji}
          </div>
        )}
        <p style={{ fontSize: '1.125rem', margin: '0 0 1.5rem 0' }}>
          {message}
        </p>
        <button onClick={onClose} className="file-picker" style={{ width: '100%' }}>
          <span>אישור</span>
        </button>
      </div>
    </Modal>
  )
}
