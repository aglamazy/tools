'use client'

/**
 * After-delete notice (aglamazo#412/#413). Shown on any device that learns its
 * account was deleted — the one that deleted it, and every other device that
 * used it. The cloud copy is gone; the data on THIS device is not, and only the
 * user may remove it ("wipe this device"). Cloud sync stays stopped while this
 * state exists (see shouldSyncNow / the guards in cloudBackupService).
 */
import { useCallback, useEffect, useState } from 'react'
import Modal from './Modal'
import YesNoModal from './YesNoModal'
import { clearCachedAvatar } from '@/app/stores/authStore'
import { signOut } from '@/app/services/firebaseAuthService'
import { wipeThisDevice } from '@/app/services/deviceAccountReconciler'
import { DEVICE_ACCOUNT_STATE_EVENT, getDeviceAccountState } from '@/app/services/deviceAccountState'
import { DELETED_NOTICE } from '@/app/services/accountDeletion/strings'

export default function AccountDeletedNotice() {
  const [deletedAt, setDeletedAt] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [confirmingWipe, setConfirmingWipe] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const state = await getDeviceAccountState()
      setDeletedAt(state.deletedAt ?? null)
    } catch (err) {
      console.error('[AccountDeletedNotice] could not read device account state:', err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener(DEVICE_ACCOUNT_STATE_EVENT, refresh)
    return () => window.removeEventListener(DEVICE_ACCOUNT_STATE_EVENT, refresh)
  }, [refresh])

  const handleWipe = async () => {
    setWiping(true)
    setError(null)
    try {
      await wipeThisDevice(signOut)
      clearCachedAvatar()
      window.location.assign('/')
    } catch (err) {
      console.error('[AccountDeletedNotice] wipe failed:', err)
      setWiping(false)
      setConfirmingWipe(false)
      setError(DELETED_NOTICE.wipeFailed)
    }
  }

  if (!deletedAt) return null

  return (
    <>
      <Modal isOpen={!dismissed} onClose={() => setDismissed(true)} maxWidth="560px" showCloseButton={false}>
        <div className="modal-body" style={{ padding: '1.75rem', textAlign: 'right' }} role="alertdialog" aria-labelledby="account-deleted-title">
          <h2 id="account-deleted-title" style={{ margin: '0 0 1rem 0', color: '#b91c1c' }}>{DELETED_NOTICE.title}</h2>
          <p style={{ margin: '0 0 0.75rem 0' }}>{DELETED_NOTICE.cloudGone}</p>
          <p style={{ margin: '0 0 0.75rem 0', fontWeight: 600 }}>{DELETED_NOTICE.dataStillHere}</p>
          <p style={{ margin: '0 0 0.5rem 0' }}>{DELETED_NOTICE.stepsIntro}</p>
          <ol style={{ margin: '0 0 1rem 0', paddingInlineStart: '1.25rem' }}>
            {DELETED_NOTICE.steps.map((step) => (
              <li key={step} style={{ marginBottom: '0.35rem' }}>{step}</li>
            ))}
          </ol>
          <p style={{ margin: '0 0 1.25rem 0', color: '#475569', fontSize: '0.9rem' }}>{DELETED_NOTICE.syncStopped}</p>
          {error && <p role="alert" style={{ color: '#b91c1c', margin: '0 0 0.75rem 0' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setConfirmingWipe(true)}
              disabled={wiping}
              style={{ flex: 1, padding: '0.65rem 1rem', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
            >
              {DELETED_NOTICE.wipeButton}
            </button>
            <button onClick={() => setDismissed(true)} disabled={wiping} className="upload-another-btn" style={{ flex: 1 }}>
              {DELETED_NOTICE.keepButton}
            </button>
          </div>
        </div>
      </Modal>
      <YesNoModal
        isOpen={confirmingWipe}
        question={DELETED_NOTICE.wipeConfirm}
        yesText={DELETED_NOTICE.wipeYes}
        noText={DELETED_NOTICE.wipeNo}
        onYes={() => void handleWipe()}
        onNo={() => setConfirmingWipe(false)}
      />
    </>
  )
}
