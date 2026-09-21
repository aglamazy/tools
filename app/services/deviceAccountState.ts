/**
 * Device-local account state (aglamazo#413): which account this browser was
 * signed in with, and whether the server has since deleted it.
 *
 * Lives in the non-synced `deviceAccount` Dexie table. It has to survive the
 * sign-out that a deletion causes (the Firebase SDK signs a device out once its
 * login no longer exists) and a reload, so the after-delete notice can show and
 * sync can stay stopped. A user-initiated sign-out clears it along with the
 * rest of the local data (clearLocalUserState).
 */
import { db, type DeviceAccountRow } from '@/app/db/financeDB'

const KEY = 'account'

/** Fired on the window whenever this state changes, so the notice can react. */
export const DEVICE_ACCOUNT_STATE_EVENT = 'device-account-state-changed'

export type DeviceAccountRefs = NonNullable<DeviceAccountRow['refs']>

async function read(): Promise<DeviceAccountRow> {
  return (await db.deviceAccount.get(KEY)) ?? { key: KEY }
}

async function write(patch: Partial<DeviceAccountRow>): Promise<void> {
  await db.deviceAccount.put({ ...(await read()), ...patch, key: KEY })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_ACCOUNT_STATE_EVENT))
}

export async function getDeviceAccountState(): Promise<DeviceAccountRow> {
  return read()
}

export async function isDeviceAccountDeleted(): Promise<boolean> {
  return !!(await read()).deletedAt
}

export async function rememberAccountRefs(refs: DeviceAccountRefs): Promise<void> {
  const current = await read()
  const same =
    current.refs?.uid === refs.uid && current.refs?.householdId === refs.householdId
  if (same) return
  await write({ refs })
}

export async function markDeviceAccountDeleted(deletedAt: string): Promise<void> {
  await write({ deletedAt: deletedAt || new Date().toISOString(), pendingSignOutCheck: false })
}

export async function setPendingSignOutCheck(pending: boolean): Promise<void> {
  await write({ pendingSignOutCheck: pending })
}

export async function clearDeviceAccountState(): Promise<void> {
  await db.deviceAccount.delete(KEY)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_ACCOUNT_STATE_EVENT))
}
