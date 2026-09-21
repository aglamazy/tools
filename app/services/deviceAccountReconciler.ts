/**
 * What does a sign-out mean, and may this device sync? (aglamazo#413)
 *
 * The rule (Agla): local data is never wiped without the user choosing. The
 * app used to wipe everything on ANY sign-out; deleting an account makes the
 * Firebase SDK sign its devices out, so that would silently destroy the local
 * copy the after-delete notice promises is still there. So:
 *
 *  - a USER-initiated sign-out still wipes (shared-browser privacy, unchanged);
 *  - a FORCED sign-out first asks the server whether the account was deleted.
 *    Deleted → keep the data and show the notice. Active → wipe as before.
 *    Could not ask → keep the data and ask again at the next load. An outage
 *    must never be read as "not deleted, safe to wipe" or "safe to sync".
 */
import { getFirebaseAuth, isFirebaseConfigured } from '@/app/lib/firebase'
import { clearLocalUserState } from './clearLocalUserState'
import { checkAccountDeleted } from './accountStatusService'
import {
  clearDeviceAccountState,
  getDeviceAccountState,
  isDeviceAccountDeleted,
  markDeviceAccountDeleted,
  rememberAccountRefs,
  setPendingSignOutCheck,
  type DeviceAccountRefs,
} from './deviceAccountState'

export type SignOutOutcome = 'wiped' | 'kept-deleted' | 'kept-unverified'

/** The uid and (from the token's claims) household of the signed-in user. */
export async function captureAccountRefs(uid: string): Promise<DeviceAccountRefs> {
  let householdId: string | undefined
  try {
    if (isFirebaseConfigured()) {
      const tokenResult = await getFirebaseAuth().currentUser?.getIdTokenResult()
      const claim = tokenResult?.claims.householdId
      if (typeof claim === 'string' && claim.length > 0) householdId = claim
    }
  } catch {
    // Claims are best-effort here; the uid alone still identifies the account.
  }
  return { uid, householdId }
}

/** Remember which account this device is signed in as, so a later sign-out can be explained. */
export async function rememberSignedInAccount(uid: string): Promise<DeviceAccountRefs> {
  const refs = await captureAccountRefs(uid)
  await rememberAccountRefs(refs)
  return refs
}

export async function handleSignOutTransition(
  previous: DeviceAccountRefs | null,
  userInitiated: boolean,
): Promise<SignOutOutcome> {
  if (await isDeviceAccountDeleted()) return 'kept-deleted'

  if (userInitiated) {
    await clearLocalUserState()
    return 'wiped'
  }

  const refs = previous ?? (await getDeviceAccountState()).refs
  if (!refs) {
    await clearLocalUserState()
    return 'wiped'
  }

  const result = await checkAccountDeleted(refs)
  if (result.status === 'deleted') {
    await markDeviceAccountDeleted(result.deletedAt)
    return 'kept-deleted'
  }
  if (result.status === 'active') {
    await clearLocalUserState()
    return 'wiped'
  }
  await setPendingSignOutCheck(true)
  return 'kept-unverified'
}

/**
 * The device loaded already signed out but remembers an account — for example it
 * was offline when the account was deleted and the SDK dropped the login before
 * the app ever saw it. Find out why, and finish a wipe that was deferred.
 */
export async function reconcileStaleSession(): Promise<void> {
  const state = await getDeviceAccountState()
  if (state.deletedAt || !state.refs) return

  const result = await checkAccountDeleted(state.refs)
  if (result.status === 'deleted') {
    await markDeviceAccountDeleted(result.deletedAt)
  } else if (result.status === 'active' && state.pendingSignOutCheck) {
    await clearLocalUserState()
  }
}

/**
 * May the cloud-sync loop run this round? Not while this device is marked
 * deleted, and not when the server says the account is deleted or cannot be
 * asked — an ID token stays valid for up to an hour after the deletion, which
 * is exactly the window in which a stale device would re-upload its data.
 */
export async function shouldSyncNow(): Promise<boolean> {
  if (await isDeviceAccountDeleted()) return false
  const uid = isFirebaseConfigured() ? getFirebaseAuth().currentUser?.uid : undefined
  if (!uid) return true // no Firebase login: nothing in the cloud to protect
  const result = await checkAccountDeleted(await captureAccountRefs(uid), { attempts: 1 })
  if (result.status === 'deleted') {
    await markDeviceAccountDeleted(result.deletedAt)
    return false
  }
  return result.status === 'active'
}

/**
 * The "wipe this device" button: local data (Dexie tables and the legacy
 * subject/partner stores — clearLocalUserState), the remembered account, the
 * session's encryption password, and the login.
 */
export async function wipeThisDevice(signOut: () => Promise<unknown>): Promise<void> {
  await clearLocalUserState()
  await clearDeviceAccountState()
  await signOut()
  try {
    sessionStorage.clear()
  } catch {
    // Storage can be unavailable (private mode); the Dexie wipe above is what matters.
  }
}
