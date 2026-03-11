/**
 * Admin Tax Settings API
 * GET  — owner reads current tax config
 * POST — owner writes tax config to Firestore
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { requireTier } from '@/app/lib/apiGuard'

export async function GET(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
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
      incomeTaxBrackets: data.incomeTaxBrackets || {},
    })
  } catch (error) {
    console.error('[Admin TaxSettings] GET failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאת שרת' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
  if (guard.error) return guard.error

  try {
    const firestore = getAdminFirestore()
    const body = await request.json()
    const { taxLimits, taxRates, incomeTaxBrackets } = body as {
      taxLimits?: { amount: number; sinceYear: number }
      taxRates?: Record<string, { reduced: { nationalInsurance: number; healthInsurance: number }; regular: { nationalInsurance: number; healthInsurance: number }; threshold: number; maxIncome: number; minIncome: number }>
      incomeTaxBrackets?: Record<string, { upTo: number; rate: number }[]>
    }

    if (!taxLimits && !taxRates && !incomeTaxBrackets) {
      return NextResponse.json({ success: false, error: 'חסרים נתונים' }, { status: 400 })
    }

    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (taxLimits) update.taxLimits = taxLimits
    if (taxRates) update.taxRates = taxRates
    if (incomeTaxBrackets) update.incomeTaxBrackets = incomeTaxBrackets

    await firestore.collection('platformSettings').doc('taxConfig').set(update, { merge: true })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin TaxSettings] POST failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאת שרת' }, { status: 500 })
  }
}
