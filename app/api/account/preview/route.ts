/**
 * GET /api/account/preview — what deleting the account would remove (aglamazo#412).
 *
 * Read-only. Feeds the Settings red zone: whether the caller may delete at all
 * (owner-only), which household members lose their logins, and which outside
 * partners lose access to shared businesses. See docs/delete-account.md.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { createAdminDeletionDeps } from '@/app/services/accountDeletion/adminDeps'
import { buildDeletionPreview } from '@/app/services/accountDeletion/preview'

export async function GET(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  try {
    const preview = await buildDeletionPreview(createAdminDeletionDeps(), guard.uid, guard.claims.householdId)
    return NextResponse.json({ success: true, ...preview }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[AccountDeletion] preview failed:', err)
    return NextResponse.json({ success: false, errorCode: 'preview-failed', error: 'Server error' }, { status: 500 })
  }
}
