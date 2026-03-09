/**
 * Terms & Conditions API Route
 * GET  — check if user accepted the latest T&C version
 * POST — record user's T&C acceptance
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'
import { config } from '@/app/config'

async function verifyAuth(request: NextRequest): Promise<string | null> {
  if (!isAdminConfigured()) return null
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const token = authHeader.slice(7)
    const decoded = await verifyIdToken(token)
    return decoded.uid
  } catch {
    return null
  }
}

// GET — check if user has accepted the latest T&C version
export async function GET(request: NextRequest) {
  const uid = await verifyAuth(request)
  if (!uid) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const firestore = getAdminFirestore()
    const userDoc = await firestore.collection('users').doc(uid).get()
    const data = userDoc.data()
    const tcAcceptedAt = data?.tcAcceptedAt as string | undefined

    const accepted = tcAcceptedAt != null && tcAcceptedAt >= config.tcVersion

    return NextResponse.json({ success: true, accepted, tcAcceptedAt })
  } catch (err: unknown) {
    console.error('[Terms API] GET error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בבדיקת תנאי שימוש' }, { status: 500 })
  }
}

// POST — accept T&C (stores current date as acceptance timestamp)
export async function POST(request: NextRequest) {
  const uid = await verifyAuth(request)
  if (!uid) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const firestore = getAdminFirestore()
    const userRef = firestore.collection('users').doc(uid)
    const userDoc = await userRef.get()

    const now = new Date().toISOString()
    if (userDoc.exists) {
      await userRef.update({ tcAcceptedAt: config.tcVersion, tcAcceptedTimestamp: now })
    } else {
      await userRef.set({ tier: 'free', tcAcceptedAt: config.tcVersion, tcAcceptedTimestamp: now })
    }

    return NextResponse.json({ success: true, tcAcceptedAt: config.tcVersion })
  } catch (err: unknown) {
    console.error('[Terms API] POST error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בשמירת אישור תנאי שימוש' }, { status: 500 })
  }
}
