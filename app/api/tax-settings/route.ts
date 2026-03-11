/**
 * Public Tax Settings API
 * GET — any authenticated user can read platform tax config from Firestore
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireAuth } from '@/app/lib/apiGuard'

export async function GET(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  try {
    const firestore = getAdminFirestore()
    const doc = await firestore.collection('platformSettings').doc('taxConfig').get()

    if (!doc.exists) {
      return NextResponse.json({ taxLimits: null, taxRates: {} })
    }

    const data = doc.data()!
    return NextResponse.json({
      taxLimits: data.taxLimits || null,
      taxRates: data.taxRates || {},
    })
  } catch (error) {
    console.error('[TaxSettings] GET failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאת שרת' }, { status: 500 })
  }
}
