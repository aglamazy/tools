import { NextRequest, NextResponse } from 'next/server'
import { requireTc } from '@/app/lib/apiGuard'
import { processChatMessage, handleReset, handleClear } from '@/app/services/chatBrain'
import { panicAdmin } from '@/app/services/adminPanic'

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

    if (result.llmExhausted) {
      // Fire the admin panic from here (server-side, throttled). Never let
      // the client trigger panic — that path is only invoked when our own
      // retry ladder observed a real upstream failure.
      panicAdmin({
        source: 'web-exhaust',
        upstreamError: result.upstreamError || 'unknown',
        uid,
        userTextSnippet: text,
      }).catch(err => console.warn('[AppChat] panicAdmin failed:', err))

      // 503 + retryable signals the React client to schedule a backoff retry.
      // The user message has NOT been persisted (chatBrain skips on exhaust),
      // so the client retrying with the same text is safe and idempotent.
      return NextResponse.json(
        {
          success: false,
          retryable: true,
          error: result.upstreamError || 'LLM exhausted',
          reply: result.reply,
        },
        { status: 503 },
      )
    }

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
