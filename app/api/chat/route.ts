import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { processChatMessage, handleReset, handleClear, isAnonUid, ANON_PREFIX } from '@/app/services/chatBrain'
import { panicAdmin } from '@/app/services/adminPanic'

const COLLECTION = 'appChatHistory'

export const maxDuration = 30

/**
 * Resolve the user identity for a chat request.
 * Authed → real Firebase uid. Anon → `anon:<sessionId>` from the request
 * (header X-Anon-Session, or auto-generated). The chatBrain treats anon ids
 * specially: no Firestore writes, no auth-requiring tools.
 *
 * Per Saliko's product model, Gemini chat is open to all visitors —
 * Saliko T&C accepted client-side via TcGate is the only gate, and that
 * runs on the client surface that hits this route.
 */
async function resolveChatIdentity(request: NextRequest): Promise<{ uid: string; displayName?: string }> {
  const guard = await requireAuth(request)
  if (!guard.error) {
    return { uid: guard.uid, displayName: guard.claims.email?.split('@')[0] }
  }
  // Anon path. Use a stable per-tab id from the client; generate one if absent.
  const headerSession = request.headers.get('x-anon-session')?.trim()
  const session = headerSession && /^[\w-]{8,64}$/.test(headerSession)
    ? headerSession
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return { uid: `${ANON_PREFIX}${session}` }
}

export async function POST(request: NextRequest) {
  const { uid, displayName } = await resolveChatIdentity(request)

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
    if (!isAnonUid(uid)) await handleReset(COLLECTION, uid)
    return NextResponse.json({ success: true, reply: 'היסטוריה נמחקה!', actions: [] })
  }

  if (text === '/clear') {
    if (!isAnonUid(uid)) await handleClear(uid)
    return NextResponse.json({ success: true, reply: 'רשימה קבועה ושינויים שבועיים נמחקו.', actions: [] })
  }

  try {
    const result = await processChatMessage({
      uid,
      text,
      displayName,
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
