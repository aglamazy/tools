/**
 * Browser side of the delete-account API (aglamazo#412). Contract:
 * docs/delete-account.md. Nothing here decides who may delete — the server does;
 * this only carries the caller's token and reports the answer faithfully.
 */
import { getIdToken, refreshIdToken, signOut } from './firebaseAuthService'
import { markDeviceAccountDeleted } from './deviceAccountState'
import type { DeletionPreview } from './accountDeletion/preview'

export type DeletionPreviewResult =
  | { ok: true; preview: DeletionPreview }
  | { ok: false; error: string }

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; errorCode: string; step?: string; retryable: boolean }

export async function fetchDeletionPreview(): Promise<DeletionPreviewResult> {
  const token = await getIdToken()
  if (!token) return { ok: false, error: 'not-signed-in' }
  const res = await fetch('/api/account/preview', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return { ok: false, error: `preview-${res.status}` }
  const { success: _success, ...preview } = await res.json()
  return { ok: true, preview: preview as DeletionPreview }
}

/**
 * Run the deletion with a token minted by the re-authentication that just
 * happened (`reauthenticate()` refreshes it). On success this device is marked
 * "account deleted" (stops cloud sync here, raises the after-delete notice) and
 * the now-dead login is signed out. Signing out does NOT wipe local data: the
 * sign-out handler checks the marker and keeps it — only "wipe this device" does.
 */
export async function requestAccountDeletion(): Promise<DeleteAccountResult> {
  const token = await refreshIdToken()
  if (!token) return { ok: false, errorCode: 'not-signed-in', retryable: false }

  const res = await fetch('/api/account/delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.success !== true) {
    return {
      ok: false,
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : `http-${res.status}`,
      step: typeof body.step === 'string' ? body.step : undefined,
      retryable: body.retryable === true,
    }
  }
  await markDeviceAccountDeleted(new Date().toISOString())
  const out = await signOut()
  if (!out.success) console.error('[DeleteAccount] account deleted, but signing out this device failed:', out.error)
  return { ok: true }
}
