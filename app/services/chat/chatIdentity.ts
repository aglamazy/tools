/**
 * Who is calling a chat endpoint: the real Firebase uid when signed in,
 * otherwise `anon:<sessionId>` from the X-Anon-Session header (generated when
 * absent). One resolver for /api/chat and /api/chat/select (saliko#36): the
 * picker cards are answered by /select, and a guest who can chat must be able
 * to click the cards the chat just showed them.
 *
 * Per Saliko's product model, chat is open to all visitors; the T&C gate runs
 * client-side (TcGate) on the surface that calls these routes.
 */
import type { NextRequest } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { ANON_PREFIX } from '@/app/services/chat/history'

export async function resolveChatIdentity(request: NextRequest): Promise<{ uid: string; displayName?: string }> {
  const guard = await requireAuth(request)
  if (!guard.error) {
    return { uid: guard.uid, displayName: guard.claims.email?.split('@')[0] }
  }
  const headerSession = request.headers.get('x-anon-session')?.trim()
  const session = headerSession && /^[\w-]{8,64}$/.test(headerSession)
    ? headerSession
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return { uid: `${ANON_PREFIX}${session}` }
}
