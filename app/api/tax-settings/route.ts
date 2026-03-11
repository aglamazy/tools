/**
 * Public Tax Settings API
 * GET — anyone can read platform tax config (general public info)
 */

import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

// PUBLIC ROUTE
export async function GET() {
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
