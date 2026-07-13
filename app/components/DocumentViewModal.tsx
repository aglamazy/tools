'use client'

import Modal from './Modal'

type DocumentViewModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  href: string | undefined
  driveFileId?: string
}

// Drive's regular webViewLink (.../file/d/{id}/view) can refuse to render
// inside an iframe (X-Frame-Options); the /preview variant is the one Google
// documents for embedding. externalUrl (e.g. a YPAY-hosted invoice) is used
// as-is — it isn't a Drive link.
function embedSrc(href: string | undefined, driveFileId: string | undefined): string | undefined {
  if (driveFileId) return `https://drive.google.com/file/d/${driveFileId}/preview`
  return href
}

export default function DocumentViewModal({ isOpen, onClose, title, href, driveFileId }: DocumentViewModalProps) {
  if (!isOpen) return null
  const src = embedSrc(href, driveFileId)

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="90vw">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '85vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>{title}</h3>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              פתח בלשונית חדשה ↗
            </a>
          )}
        </div>
        {src ? (
          <iframe
            src={src}
            title={title}
            style={{ flex: 1, width: '100%', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
          />
        ) : (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>אין קישור למסמך</p>
        )}
      </div>
    </Modal>
  )
}
