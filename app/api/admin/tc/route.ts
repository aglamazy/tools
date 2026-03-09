/**
 * Admin: Terms & Conditions versions API
 * GET  — list all T&C versions
 * POST — create a new T&C version (version = current date)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken, getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'

const TC_COLLECTION = 'tcVersions'

async function verifyOwner(request: NextRequest): Promise<string | null> {
  if (!isAdminConfigured()) return null
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const decoded = await verifyIdToken(authHeader.slice(7))
    const firestore = getAdminFirestore()
    const userDoc = await firestore.collection('users').doc(decoded.uid).get()
    const tier = userDoc.data()?.tier
    if (tier !== 'owner') return null
    return decoded.uid
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const uid = await verifyOwner(request)
  if (!uid) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const firestore = getAdminFirestore()
    const snapshot = await firestore.collection(TC_COLLECTION).orderBy('version', 'desc').get()
    const versions = snapshot.docs.map(doc => ({
      version: doc.id,
      text: doc.data().text as string,
      createdBy: doc.data().createdBy as string | undefined,
    }))

    return NextResponse.json({ success: true, versions })
  } catch (err: unknown) {
    console.error('[Admin TC] GET error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת גרסאות' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const uid = await verifyOwner(request)
  if (!uid) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { text } = await request.json()
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'טקסט תנאי שימוש חסר' }, { status: 400 })
    }

    const firestore = getAdminFirestore()
    const version = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    await firestore.collection(TC_COLLECTION).doc(version).set({
      text: text.trim(),
      version,
      createdBy: uid,
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, version })
  } catch (err: unknown) {
    console.error('[Admin TC] POST error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בשמירה' }, { status: 500 })
  }
}
