/**
 * Was the coming sign-out asked for by the user (or by the wipe button), or did
 * Firebase force it — for instance because the login was deleted with the
 * account? The two must be treated differently (aglamazo#413): a user-initiated
 * sign-out wipes local data as it always has; a forced one must first find out
 * whether the account was deleted, because local data is never wiped without the
 * user choosing it.
 */
let userInitiated = false

export function markUserInitiatedSignOut(): void {
  userInitiated = true
}

/** Returns whether the sign-out was user-initiated, and resets the flag. */
export function consumeUserInitiatedSignOut(): boolean {
  const value = userInitiated
  userInitiated = false
  return value
}
