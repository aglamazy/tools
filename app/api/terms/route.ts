/**
 * Terms & Conditions API Route
 * GET  — return latest T&C text + check if user accepted it
 * POST — record user's T&C acceptance
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, setUserClaims } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'
import { config } from '@/app/config'

const TC_COLLECTION = 'tcVersions'

async function getLatestTcVersion(firestore: FirebaseFirestore.Firestore) {
  const snapshot = await firestore.collection(TC_COLLECTION).orderBy('version', 'desc').limit(1).get()
  if (snapshot.empty) return null
  const doc = snapshot.docs[0]
  return { version: doc.id, text: doc.data().text as string }
}

// GET — return latest T&C text and acceptance status
export async function GET(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const firestore = getAdminFirestore()
    const [userDoc, latestTc] = await Promise.all([
      firestore.collection('users').doc(uid).get(),
      getLatestTcVersion(firestore),
    ])

    const data = userDoc.data()
    const tcAcceptedAt = data?.tcAcceptedAt as string | undefined
    // Use Firestore version if available, fall back to config
    const requiredVersion = latestTc?.version ?? config.tcVersion
    const accepted = tcAcceptedAt != null && tcAcceptedAt >= requiredVersion

    return NextResponse.json({
      success: true,
      accepted,
      tcAcceptedAt,
      version: requiredVersion,
      text: latestTc?.text ?? null,
    })
  } catch (err: unknown) {
    console.error('[Terms API] GET error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בבדיקת תנאי שימוש' }, { status: 500 })
  }
}

// POST — accept T&C (stores latest version date)
export async function POST(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  const uid = guard.uid

  try {
    const firestore = getAdminFirestore()
    const latestTc = await getLatestTcVersion(firestore)
    const version = latestTc?.version ?? config.tcVersion

    const userRef = firestore.collection('users').doc(uid)
    const userDoc = await userRef.get()

    const now = new Date().toISOString()
    if (userDoc.exists) {
      await userRef.update({ tcAcceptedAt: version, tcAcceptedTimestamp: now })
    } else {
      await userRef.set({ tier: 'free', tcAcceptedAt: version, tcAcceptedTimestamp: now })
    }

    // Sync to custom claims so the proxy can check T&C without Firestore
    await setUserClaims(uid, { tcAcceptedAt: version })

    return NextResponse.json({ success: true, tcAcceptedAt: version })
  } catch (err: unknown) {
    console.error('[Terms API] POST error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בשמירת אישור תנאי שימוש' }, { status: 500 })
  }
}
