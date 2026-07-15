/**
 * Public Tax Settings API
 * GET — anyone can read platform tax config (general public info)
 */

import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { withServiceCall } from '@/app/lib/observe'

// PUBLIC ROUTE
async function GETHandler() {
  try {
    const firestore = getAdminFirestore()
    const doc = await firestore.collection('platformSettings').doc('taxConfig').get()

    if (!doc.exists) {
      return NextResponse.json({ taxLimits: null, exemptLimit: null, taxRates: {} })
    }

    const data = doc.data()!
    return NextResponse.json({
      taxLimits: data.taxLimits || null,
      exemptLimit: data.exemptLimit || null,
      taxRates: data.taxRates || {},
      incomeTaxBrackets: data.incomeTaxBrackets || {},
    })
  } catch (error) {
    console.error('[TaxSettings] GET failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאת שרת' }, { status: 500 })
  }
}

export const GET = withServiceCall(GETHandler)
