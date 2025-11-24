'use client'

import { useEffect, ReactNode } from 'react'

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: string
  showCloseButton?: boolean
}

export default function Modal({ isOpen, onClose, children, maxWidth = '600px', showCloseButton = true }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth }}>
        {showCloseButton && (
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
