import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { processChatMessage, handleReset, handleClear, isAnonUid, ANON_PREFIX, refreshOpenOrderCaches } from '@/app/services/chatBrain'
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

interface ChatRequestBody {
  message: string
  /**
   * Anon visitors don't have server-side history (no Firestore writes for
   * anon). To preserve conversation context across turns the client sends
   * its recent Dexie messages with each request. The server uses this as
   * the persistedHistory for the call. Authed users ignore this — Firestore
   * is the source of truth.
   */
  history?: { role: 'user' | 'assistant'; content: string }[]
  /**
   * Saliko Tier-1 anon credential state. Lives only in browser sessionStorage
   * (`saliko.anonStoreCreds`), ships in on every request, server uses it
   * in-memory for one HTTP request and forgets. Per privacy policy
   * `SALIKO_PRIVACY_TIERS.anonymous`: nothing about an anon visitor is ever
   * written to our server, including this. Shape validated by the executor
   * before use — treat as untrusted input.
   */
  anonStoreCreds?: {
    storeId?: unknown
    phone?: unknown
    token?: unknown
    orderedOnce?: unknown
  } | null
}

/** Narrow untrusted request-body shape to the executor's AnonStoreCreds. */
function parseAnonStoreCreds(raw: ChatRequestBody['anonStoreCreds']): {
  storeId: string; phone: string; token?: string; orderedOnce?: boolean
} | null {
  if (!raw || typeof raw !== 'object') return null
  const storeId = typeof raw.storeId === 'string' ? raw.storeId : ''
  const phone = typeof raw.phone === 'string' ? raw.phone : ''
  if (!storeId || !phone) return null
  return {
    storeId,
    phone,
    ...(typeof raw.token === 'string' && raw.token ? { token: raw.token } : {}),
    ...(raw.orderedOnce === true ? { orderedOnce: true } : {}),
  }
}

export async function POST(request: NextRequest) {
  const { uid, displayName } = await resolveChatIdentity(request)

  let body: ChatRequestBody
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
    // Refresh the open-order cache for this user's stores fire-and-forget, IN
    // PARALLEL with the LLM call below. Kicking the promise off here (not inside
    // `after`) starts the slow store query immediately so it overlaps the LLM
    // round-trip instead of running serially after it. `after()` then keeps the
    // function instance alive past the response until the write drains — within
    // maxDuration. The reply is never blocked; the fresh snapshot is read next
    // turn. refreshOpenOrderCaches always resolves, so `after` can't reject.
    const openOrderRefresh = refreshOpenOrderCaches(uid)
    after(() => openOrderRefresh)

    // Anon cred state is only meaningful for anon callers. For authed users
    // it's silently ignored — they have Firestore-backed Tier-2/3 creds.
    const inboundAnonCreds = isAnonUid(uid) ? parseAnonStoreCreds(body.anonStoreCreds) : null
    const result = await processChatMessage({
      uid,
      text,
      displayName,
      historyCollection: COLLECTION,
      includeTasks: true,
      // Only honor client-supplied history for anon visitors. Authed users
      // get their persistent Firestore-backed thread, which is more reliable
      // and prevents an attacker-tampered history from polluting their context.
      seedHistory: isAnonUid(uid) ? body.history : undefined,
      anonStoreCreds: inboundAnonCreds,
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
      // Echo back anon cred mutations so the browser can persist them to
      // sessionStorage. `undefined` is dropped by JSON.stringify (no key in
      // response = client keeps current); `null` means "wipe."
      ...(result.anonStoreCreds !== undefined ? { anonStoreCreds: result.anonStoreCreds } : {}),
    })
  } catch (err) {
    console.error('[AppChat] Error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
