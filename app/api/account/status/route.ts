// PUBLIC ROUTE: a device whose login was deleted along with the account can no
// longer authenticate, yet must learn WHY it is signed out (aglamazo#413). The
// answer is only "was this uid / household deleted, and when" — ids are
// unguessable Firebase ids the device already holds, and nothing else is returned.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { findAccountMarker, isValidRefId } from '@/app/lib/accountMarker'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500, headers: NO_STORE })
  }

  const body = await request.json().catch(() => null)
  const uid = body?.uid
  const householdId = body?.householdId
  const bad = (value: unknown) => value !== undefined && value !== null && !isValidRefId(value)
  if ((uid == null && householdId == null) || bad(uid) || bad(householdId)) {
    return NextResponse.json({ error: 'Provide a valid uid and/or householdId' }, { status: 400, headers: NO_STORE })
  }

  try {
    const status = await findAccountMarker({ uid: uid ?? undefined, householdId: householdId ?? undefined })
    return NextResponse.json(status, { headers: NO_STORE })
  } catch (err) {
    console.error('[AccountStatus] marker lookup failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: NO_STORE })
  }
}
