/**
 * Client side of POST /api/account/status (aglamazo#413). Asks the server
 * whether an account this device knows about was deleted. The endpoint is
 * public because a deleted login can no longer authenticate.
 *
 * Three outcomes, never two: an unreachable server is 'unknown', NOT 'active'.
 * Callers must not treat "could not ask" as "not deleted" and wipe or sync on it.
 */
import type { DeviceAccountRefs } from './deviceAccountState'

export type AccountStatus =
  | { status: 'deleted'; deletedAt: string }
  | { status: 'active' }
  | { status: 'unknown' }

export type StatusCheckOptions = {
  /** Total tries. The post-deletion sign-out and the sync loop use 3 and 1. */
  attempts?: number
  retryDelaysMs?: number[]
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_DELAYS = [1000, 3000]

export async function checkAccountDeleted(
  refs: Partial<DeviceAccountRefs>,
  options: StatusCheckOptions = {},
): Promise<AccountStatus> {
  if (!refs.uid && !refs.householdId) return { status: 'unknown' }
  const attempts = options.attempts ?? 3
  const delays = options.retryDelaysMs ?? DEFAULT_DELAYS
  const doFetch = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(delays[Math.min(attempt - 1, delays.length - 1)])
    try {
      const res = await doFetch('/api/account/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ uid: refs.uid, householdId: refs.householdId }),
      })
      if (!res.ok) continue
      const body = await res.json()
      if (body?.deleted === true) {
        return { status: 'deleted', deletedAt: typeof body.deletedAt === 'string' ? body.deletedAt : '' }
      }
      if (body?.deleted === false) return { status: 'active' }
    } catch {
      // Offline or the server is down: try again, then report 'unknown'.
    }
  }
  return { status: 'unknown' }
}
