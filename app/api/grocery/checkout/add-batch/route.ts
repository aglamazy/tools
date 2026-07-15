import { NextRequest, NextResponse } from 'next/server'
import { requireTc } from '@/app/lib/apiGuard'
import { initStores } from '@/app/services/grocery/initStores'
import { addCheckoutBatch } from '@/app/services/grocery/shufersalCheckoutFlow'
import { withServiceCall } from '@/app/lib/observe'

export const maxDuration = 30

async function POSTHandler(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error

  initStores()

  let body: { checkoutId?: string; batchIndex?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.checkoutId || typeof body.batchIndex !== 'number') {
    return NextResponse.json({ success: false, message: 'Missing checkoutId or batchIndex' }, { status: 400 })
  }

  const result = await addCheckoutBatch(guard.uid, body.checkoutId, body.batchIndex)
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.message })
  }
  return NextResponse.json({ success: true, completed: result.completed, total: result.total, ready: result.ready })
}

export const POST = withServiceCall(POSTHandler)
