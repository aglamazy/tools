/**
 * Tier-3 Shufersal credential push from the Settings UI (or chat).
 *
 * PUT body: `{ email, password }`. Encrypts both via `credEncryption` and
 * writes them to `groceries/{uid}/private/credentials`. Refuses (412) if the
 * user hasn't granted Tier-3 consent — the UI is expected to flip the
 * Tier-3 toggle first via `POST /api/consent/server-creds`.
 *
 * Dexie remains the master copy on the client; this endpoint is a derived
 * server-side mirror that exists ONLY so cron can log in unattended.
 *
 * Saliko-only — Aglamazo doesn't run grocery cron and has no Shufersal flow.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { VARIANT } from '@/app/config/variants'
import { saveCredentials } from '@/app/services/grocery/shufersalClient'
import { NoTier3ConsentError } from '@/app/services/consentService'
import { withServiceCall } from '@/app/lib/observe'

async function PUTHandler(request: NextRequest) {
  if (VARIANT !== 'saliko') {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return NextResponse.json({ success: false, error: 'email and password required' }, { status: 400 })
  }

  try {
    await saveCredentials(guard.uid, email, password)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof NoTier3ConsentError) {
      return NextResponse.json(
        { success: false, error: err.message, code: 'NO_TIER3_CONSENT' },
        { status: 412 },
      )
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Credentials/Shufersal API] PUT failed:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export const PUT = withServiceCall(PUTHandler)
