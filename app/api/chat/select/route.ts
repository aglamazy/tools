import { NextRequest, NextResponse } from 'next/server'
import { requireTc } from '@/app/lib/apiGuard'
import { selectProduct } from '@/app/services/telegram/actionExecutor'
import { initStores } from '@/app/services/grocery/initStores'

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error

  initStores()

  let body: { searchKey: string; resultIndex: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { searchKey, resultIndex } = body
  if (!searchKey || typeof resultIndex !== 'number') {
    return NextResponse.json({ success: false, error: 'Missing searchKey or resultIndex' }, { status: 400 })
  }

  try {
    const result = await selectProduct(guard.uid, searchKey, resultIndex)
    return NextResponse.json({ success: true, message: result.message })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('[AppChat/Select] Error:', err)
    return NextResponse.json({ success: false, error: msg }, { status: msg === 'החיפוש פג תוקף' ? 404 : 500 })
  }
}
