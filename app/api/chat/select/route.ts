// CALLER-KEYED ROUTE — identity from resolveChatIdentity: the signed-in uid (requireAuth), else the
// caller's anon chat session; guests may chat and pick by design (Saliko), T&C gate is client-side TcGate.
import { NextRequest, NextResponse } from 'next/server'
import { resolveChatIdentity } from '@/app/services/chat/chatIdentity'
import { selectProduct } from '@/app/services/chat/pendingSearchService'
import { initStores } from '@/app/services/grocery/initStores'

export async function POST(request: NextRequest) {
  // Same identity as /api/chat (saliko#36): requireTc here refused guests (401)
  // and so the picker cards the chat showed them did nothing when clicked.
  const { uid } = await resolveChatIdentity(request)

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
    const result = await selectProduct(uid, searchKey, resultIndex)
    return NextResponse.json({ success: true, message: result.message })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('[AppChat/Select] Error:', err)
    return NextResponse.json({ success: false, error: msg }, { status: msg === 'החיפוש פג תוקף' ? 404 : 500 })
  }
}
