'use client'

/**
 * The steps between "Delete account" and the server call (aglamazo#412):
 * export first (or an explicit decline) → fresh re-authentication → final Yes/No.
 * Deletion itself is POST /api/account/delete; on success the device is marked
 * "account deleted" and AccountDeletedNotice takes over (docs/delete-account.md).
 */
import { useState } from 'react'
import Modal from '../Modal'
import YesNoModal from '../YesNoModal'
import { downloadFullBackup } from '@/app/services/backupDownload'
import { getReauthMethod, reauthenticate } from '@/app/services/firebaseAuthService'
import { requestAccountDeletion } from '@/app/services/accountDeletionClient'
import { DELETE_ACCOUNT as T } from '@/app/services/accountDeletion/strings'

type Step = 'export' | 'reauth' | 'confirm' | 'deleting'

export default function DeleteAccountFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('export')
  const [exported, setExported] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const method = getReauthMethod()

  const handleExport = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadFullBackup()
      setExported(true)
    } catch (err) {
      console.error('[DeleteAccount] export failed:', err)
      setError(T.exportFailed)
    } finally {
      setBusy(false)
    }
  }

  const handleReauth = async () => {
    setBusy(true)
    setError(null)
    const result = await reauthenticate(method === 'password' ? password : undefined)
    setBusy(false)
    if (!result.success) {
      setError(result.error ?? T.failedReauth)
      return
    }
    setPassword('')
    setStep('confirm')
  }

  const handleDelete = async () => {
    setStep('deleting')
    setError(null)
    const result = await requestAccountDeletion()
    if (result.ok) {
      onClose()
      return
    }
    console.error('[DeleteAccount] deletion failed:', result)
    if (result.errorCode === 'reauth-required') {
      setError(T.failedReauth)
      setStep('reauth')
    } else if (result.errorCode === 'not-owner') {
      setError(T.failedNotOwner)
      setStep('export')
    } else {
      setError(T.failedRetry)
      setStep('confirm')
    }
  }

  const errorLine = error && <p style={{ color: '#b91c1c', margin: '0.75rem 0 0' }}>{error}</p>

  return (
    <>
      <Modal isOpen={step === 'export' || step === 'reauth' || step === 'deleting'} onClose={step === 'deleting' ? () => {} : onClose} maxWidth="480px" showCloseButton={false}>
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          {step === 'export' && (
            <>
              <h3 style={{ marginTop: 0 }}>{T.exportTitle}</h3>
              <p>{T.exportBody}</p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={handleExport} disabled={busy} className="file-picker">{T.exportButton}</button>
                {exported && <span style={{ color: '#166534' }}>{T.exportDone}</span>}
              </div>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
                <input type="checkbox" checked={declined} onChange={(e) => setDeclined(e.target.checked)} />
                {T.exportDecline}
              </label>
              {errorLine}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button onClick={() => { setError(null); setStep('reauth') }} disabled={!exported && !declined} className="file-picker">{T.next}</button>
                <button onClick={onClose} className="upload-another-btn">{T.cancel}</button>
              </div>
            </>
          )}
          {step === 'reauth' && (
            <>
              <h3 style={{ marginTop: 0 }}>{T.reauthTitle}</h3>
              <p>{T.reauthBody}</p>
              {method === 'password' && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={T.passwordLabel}
                  autoComplete="current-password"
                  style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
                />
              )}
              {method === 'unsupported' && <p style={{ color: '#b91c1c' }}>{T.reauthUnsupported}</p>}
              {errorLine}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                {method === 'password' && (
                  <button onClick={handleReauth} disabled={busy || password.length === 0} className="file-picker">{T.reauthPassword}</button>
                )}
                {method === 'google' && (
                  <button onClick={handleReauth} disabled={busy} className="file-picker">{T.reauthGoogle}</button>
                )}
                <button onClick={onClose} className="upload-another-btn">{T.cancel}</button>
              </div>
            </>
          )}
          {step === 'deleting' && <p style={{ margin: 0, textAlign: 'center' }}>{T.deleting}</p>}
        </div>
      </Modal>
      <YesNoModal
        isOpen={step === 'confirm'}
        question={error && step === 'confirm' ? `${error} ${T.confirmQuestion}` : T.confirmQuestion}
        yesText={T.confirmYes}
        noText={T.confirmNo}
        onYes={handleDelete}
        onNo={onClose}
      />
    </>
  )
}
