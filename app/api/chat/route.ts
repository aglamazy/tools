import { NextRequest, NextResponse } from 'next/server'
import { requireTc } from '@/app/lib/apiGuard'
import { processChatMessage, handleReset, handleClear } from '@/app/services/chatBrain'

const COLLECTION = 'appChatHistory'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const guard = await requireTc(request)
  if (guard.error) return guard.error

  const uid = guard.uid

  let body: { message: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const text = body.message?.trim()
  if (!text) {
    return NextResponse.json({ success: false, error: 'Empty message' }, { status: 400 })
  }

  if (text === '/reset') {
    await handleReset(COLLECTION, uid)
    return NextResponse.json({ success: true, reply: 'היסטוריה נמחקה!', actions: [] })
  }

  if (text === '/clear') {
    await handleClear(uid)
    return NextResponse.json({ success: true, reply: 'רשימה קבועה ושינויים שבועיים נמחקו.', actions: [] })
  }

  try {
    const result = await processChatMessage({
      uid,
      text,
      displayName: guard.claims.email?.split('@')[0],
      historyCollection: COLLECTION,
      includeTasks: true,
    })

    return NextResponse.json({
      success: true,
      reply: result.reply,
      thinking: result.thinking,
      pendingSelections: result.pendingSelections,
    })
  } catch (err) {
    console.error('[AppChat] Error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
