/**
 * POST /api/account/delete — self-serve account deletion (aglamazo#411).
 *
 * Owner-only ("account = household"); a solo user is the owner of their own
 * account. Requires a FRESH sign-in (re-authentication) — the final Yes/No
 * confirmation lives in the client. Runs the whole idempotent job; on a
 * mid-run failure it answers 500 naming the step, and the same signed-in
 * owner can simply call it again. See docs/delete-account.md.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import {
  DeletionStepError,
  resolveSubject,
  runAccountDeletion,
} from '@/app/services/accountDeletion/accountDeletionService'
import { createAdminDeletionDeps } from '@/app/services/accountDeletion/adminDeps'

/** How recent the sign-in must be for a deletion to be accepted. */
const REAUTH_WINDOW_SECONDS = 5 * 60

export async function POST(request: NextRequest) {
  // allowDeletedAccount: a run that failed after the marker was written must be re-runnable.
  const guard = await requireAuth(request, { allowDeletedAccount: true })
  if (guard.error) return guard.error

  const ageSeconds = Math.floor(Date.now() / 1000) - guard.authTime
  if (!(ageSeconds >= 0 && ageSeconds <= REAUTH_WINDOW_SECONDS)) {
    return NextResponse.json(
      { success: false, errorCode: 'reauth-required', error: 'Sign in again to delete the account' },
      { status: 403 },
    )
  }

  try {
    const deps = createAdminDeletionDeps()
    const subject = await resolveSubject(deps, guard.uid, guard.claims.householdId)
    if (!subject.ok) {
      return NextResponse.json(
        { success: false, errorCode: subject.code, error: 'Only the household owner can delete the account' },
        { status: 403 },
      )
    }
    await runAccountDeletion(deps, subject.plan)
    return NextResponse.json({
      success: true,
      kind: subject.plan.kind,
      accountsDeleted: subject.plan.uids.length,
      resumed: subject.resumed,
    })
  } catch (err) {
    if (err instanceof DeletionStepError) {
      console.error(`[AccountDeletion] failed at step "${err.step}":`, err.cause)
      return NextResponse.json(
        { success: false, errorCode: 'deletion-failed', step: err.step, retryable: true, error: 'Deletion did not complete — try again' },
        { status: 500 },
      )
    }
    console.error('[AccountDeletion] unexpected failure:', err)
    return NextResponse.json({ success: false, errorCode: 'unknown', error: 'Server error' }, { status: 500 })
  }
}
