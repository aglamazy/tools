import { NextRequest, NextResponse } from 'next/server'
import { requireTc } from '@/app/lib/apiGuard'
import { initStores } from '@/app/services/grocery/initStores'
import { finalizeShufersalCheckoutSession } from '@/app/services/grocery/shufersalCheckoutFlow'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error

  initStores()

  let body: { checkoutId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.checkoutId) {
    return NextResponse.json({ success: false, message: 'Missing checkoutId' }, { status: 400 })
  }

  const result = await finalizeShufersalCheckoutSession(guard.uid, body.checkoutId)
  const payload = 'requiresAttendedCheckout' in result
    ? { success: false, requiresAttendedCheckout: true, message: result.message, items: result.items, day: result.day, time: result.time }
    : { success: result.ok, message: result.message }
  console.log(`[CheckoutFinalizeRoute] responding uid=${guard.uid} checkoutId=${body.checkoutId}: ${JSON.stringify(payload)}`)
  return NextResponse.json(payload)
}
