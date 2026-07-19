import { NextRequest, NextResponse } from 'next/server'
import { requireTc } from '@/app/lib/apiGuard'
import { initStores } from '@/app/services/grocery/initStores'
import { startShufersalCheckout } from '@/app/services/grocery/shufersalCheckoutFlow'
import { withServiceCall } from 'agents-observe/next'

export const maxDuration = 30

async function handler(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error

  initStores()

  let body: { day?: string; time?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const result = await startShufersalCheckout(guard.uid, body.day, body.time)
  if (!result.ok) {
    if ('requiresAttendedCheckout' in result) {
      return NextResponse.json({ success: false, requiresAttendedCheckout: true, message: result.message, items: result.items, day: result.day, time: result.time })
    }
    return NextResponse.json({ success: false, message: result.message })
  }
  return NextResponse.json({
    success: true,
    checkoutId: result.checkoutId,
    totalBatches: result.totalBatches,
    storeLabel: result.storeLabel,
  })
}

export const POST = withServiceCall((req, ...args) => handler(req as NextRequest, ...args as []))
