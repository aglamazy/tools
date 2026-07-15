/**
 * Privacy Statement API Route — Saliko-specific.
 *
 * GET — return the latest privacy text + (if authenticated) acceptance status.
 *
 * Public route, mirrors `/api/terms`. The chat brain and other downstream
 * consumers fetch this endpoint to quote the canonical privacy text + the
 * version slug the user agreed to.
 *
 * Source of truth: `app/saliko/privacy/privacyContent.ts`. The route prefers
 * the latest doc from Firestore (`privacyVersions/{slug}`) so a published
 * policy can be updated without a redeploy, but falls back to the in-code
 * constants if Firestore is empty (e.g. local dev where the seed hasn't been
 * run yet). To re-seed Firestore after editing the in-code copy run:
 *   `npx tsx scripts/seed-saliko-privacy.ts`
 *
 * This route only serves Saliko. On the Aglamazo deployment it returns 404 —
 * Aglamazo doesn't act on the user's behalf and has no privacy statement of
 * this shape.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'
import { VARIANT } from '@/app/config/variants'
import { withServiceCall } from '@/app/lib/observe'
import {
  SALIKO_PRIVACY_HTML,
  SALIKO_PRIVACY_VERSION,
} from '@/app/saliko/privacy/privacyContent'

const PRIVACY_COLLECTION = 'privacyVersions'

async function getLatestPrivacyVersion(firestore: FirebaseFirestore.Firestore) {
  const snapshot = await firestore
    .collection(PRIVACY_COLLECTION)
    .orderBy('version', 'desc')
    .limit(1)
    .get()
  if (snapshot.empty) return null
  const doc = snapshot.docs[0]
  return { version: doc.id, text: doc.data().text as string }
}

// PUBLIC ROUTE (Saliko only).
// GET — return latest privacy text + acceptance status (if logged in).
async function GETHandler(request: NextRequest) {
  if (VARIANT !== 'saliko') {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 },
    )
  }

  try {
    let version = SALIKO_PRIVACY_VERSION
    let text = SALIKO_PRIVACY_HTML

    // Prefer Firestore (so we can publish updates without a redeploy) but
    // fall back to the in-code constants in dev / before seeding.
    try {
      const firestore = getAdminFirestore()
      const latest = await getLatestPrivacyVersion(firestore)
      if (latest) {
        version = latest.version
        text = latest.text
      }
    } catch (err) {
      console.warn('[Privacy API] Firestore lookup failed, using in-code fallback:', err)
    }

    // If user is authenticated, attach their acceptance status.
    let accepted: boolean | null = null
    let privacyAcceptedAt: string | undefined
    try {
      const guard = await requireAuth(request)
      if (!guard.error) {
        const firestore = getAdminFirestore()
        const userDoc = await firestore.collection('users').doc(guard.uid).get()
        const data = userDoc.data()
        privacyAcceptedAt = data?.privacyAcceptedAt as string | undefined
        accepted = privacyAcceptedAt != null && privacyAcceptedAt >= version
      }
    } catch {
      // unauthenticated — leave accepted as null
    }

    return NextResponse.json({
      success: true,
      accepted,
      privacyAcceptedAt,
      version,
      text,
    })
  } catch (err: unknown) {
    console.error('[Privacy API] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'שגיאה בקריאת מדיניות הפרטיות' },
      { status: 500 },
    )
  }
}

export const GET = withServiceCall(GETHandler)
