// PUBLIC ROUTE — local dev authentication
/**
 * Local Auth API Route
 * Validates username/password against config/auth in Firestore (Admin SDK).
 * On first run (no config/auth doc), seeds it with hardcoded defaults.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, getAdminAuth, isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { withServiceCall } from '@/app/lib/observe'

const SEED_USERNAME = 'root'
const SEED_PASSWORD = 'ABC123'

async function POSTHandler(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'לא זמין' }, { status: 403 })
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ success: false, error: 'שרת לא מוגדר' }, { status: 500 })
  }

  const { username, password } = await request.json()

  const db = getAdminFirestore()
  const ref = db.collection('config').doc('auth')
  const snap = await ref.get()

  if (!snap.exists) {
    // First run — seed with defaults
    if (username !== SEED_USERNAME || password !== SEED_PASSWORD) {
      return NextResponse.json({ success: false, error: 'שם משתמש או סיסמה שגויים' })
    }
    await ref.set({ username: SEED_USERNAME, password: SEED_PASSWORD })
    console.info('[LocalAuth] Seeded config/auth')
  } else {
    const config = snap.data() as { username: string; password: string }
    if (username !== config.username || password !== config.password) {
      return NextResponse.json({ success: false, error: 'שם משתמש או סיסמה שגויים' })
    }
  }

  // Ensure the local user document exists in Firestore with owner tier
  await db.collection('users').doc('local-auth-user').set(
    { tier: 'owner', username },
    { merge: true }
  )

  const customToken = await getAdminAuth().createCustomToken('local-auth-user', { localAuth: true, tier: 'owner' })
  return NextResponse.json({ success: true, customToken })
}

export const POST = withServiceCall(POSTHandler)
