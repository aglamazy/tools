/**
 * Deletion-ledger entry shape + freshness rule (aglamazo#347/#350).
 *
 * Root cause: a local delete only updates this ledger locally — nothing
 * pushes it to Firestore by itself. If a sync cycle (auto-triggered as soon
 * as 3 seconds after a reload) pulls the cloud's still-old copy before that
 * push happens, applyMergedBackupService.ts's resurrection guard (built
 * 2026-07-22 for a real cross-device data-loss incident) sees "cloud still
 * has this record" and un-deletes it, then re-uploads that resurrected
 * state — making the un-delete permanent and shared.
 *
 * Fix: timestamp each tombstone. A FRESH tombstone (this device, this
 * session, not yet had time to propagate) is honored unconditionally — the
 * resurrection guard only gets to override a tombstone old enough that it
 * could plausibly be a genuine stale-vs-another-device conflict, which is
 * the case the guard exists for.
 *
 * A legacy (pre-this-fix) entry — a bare string, no timestamp — is treated
 * as NOT fresh, preserving today's guard behavior for it. This is
 * deliberate, not an oversight: per the asymmetry rule (Sheli, 2026-09-08 —
 * whatever's uncertain must stay wrong on the "resurrects" side, never the
 * "destroys" side), an entry whose age we cannot verify must not newly
 * start being trusted unconditionally, since that would be the same
 * direction of mistake the July 22 incident was.
 */

export type DeletionLedgerEntry = string | { syncId: string; deletedAt: string }
export type DeletionLedger = Record<string, DeletionLedgerEntry[]>

/** Generous on purpose — the observed race window was 3 seconds. This margin
 * comfortably covers realistic push delay (retries, backgrounding, a slow or
 * briefly-offline device) while still leaving the guard meaningful for
 * anything old enough to be a real cross-device conflict. */
export const FRESH_TOMBSTONE_WINDOW_MS = 30 * 60 * 1000

// Defensive against a malformed entry (observed live 2026-09-10: legacy
// arrays carrying a literal `undefined`/`null` element from before this
// module existed — inert under the old plain-string-only reader, but a hard
// TypeError the instant anything here started doing property access on
// every entry unconditionally). Returns '' rather than throwing; '' can
// never match a real syncId (always a UUID), so callers that skip a falsy
// result drop the garbage entry instead of crashing the whole sync.
export function entrySyncId(e: DeletionLedgerEntry): string {
  if (typeof e === 'string') return e
  return (e && typeof e === 'object' && typeof e.syncId === 'string') ? e.syncId : ''
}

export function entryDeletedAt(e: DeletionLedgerEntry): string | null {
  if (typeof e !== 'object' || !e) return null
  return e.deletedAt ?? null
}

export function isFreshTombstone(deletedAt: string | null, now: number = Date.now()): boolean {
  if (!deletedAt) return false
  const ts = Date.parse(deletedAt)
  if (!Number.isFinite(ts)) return false
  return now - ts < FRESH_TOMBSTONE_WINDOW_MS
}

export function makeDeletionEntry(syncId: string): { syncId: string; deletedAt: string } {
  return { syncId, deletedAt: new Date().toISOString() }
}

/** Browser event fired whenever the local deletion ledger gains a new entry
 * — CloudSyncManager listens for this to push sooner than its normal
 * interval, so a fresh tombstone reaches the cloud with margin to spare
 * rather than relying solely on the freshness window above. */
export const DELETION_LEDGER_UPDATED_EVENT = 'aglamazo:deletion-ledger-updated'

export function notifyDeletionLedgerUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DELETION_LEDGER_UPDATED_EVENT))
  }
}
