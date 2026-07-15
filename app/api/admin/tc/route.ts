/**
 * Admin: Terms & Conditions versions API
 * GET  — list all T&C versions
 * POST — create a new T&C version (version = current date)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireTier } from '@/app/lib/apiGuard'
import { withServiceCall } from '@/app/lib/observe'

const TC_COLLECTION = 'tcVersions'

async function GETHandler(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
  if (guard.error) return guard.error

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

async function POSTHandler(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
  if (guard.error) return guard.error

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
      createdBy: guard.uid,
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, version })
  } catch (err: unknown) {
    console.error('[Admin TC] POST error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בשמירה' }, { status: 500 })
  }
}

export const GET = withServiceCall(GETHandler)
export const POST = withServiceCall(POSTHandler)
