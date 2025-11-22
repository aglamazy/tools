'use client'

import { useEffect } from 'react'
import FileBrowser from './FileBrowser'

type FileSelectModalProps = {
  isOpen: boolean
  onClose: () => void
  onFileSelect: (file: File) => void
  savedDirHandle: FileSystemDirectoryHandle | null
  onDirHandleChange: (handle: FileSystemDirectoryHandle | null) => void
}

export default function FileSelectModal({ isOpen, onClose, onFileSelect, savedDirHandle, onDirHandleChange }: FileSelectModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleFileSelect = (file: File) => {
    onFileSelect(file)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>בחר קובץ לניתוח</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <FileBrowser
            onFileSelect={handleFileSelect}
            isOpen={isOpen}
            savedDirHandle={savedDirHandle}
            onDirHandleChange={onDirHandleChange}
          />
        </div>
      </div>
    </div>
  )
}
