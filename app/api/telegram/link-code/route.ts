/**
 * POST /api/telegram/link-code — generate a one-time code for linking Telegram.
 * Auth: standard user auth (Bearer token from Aglamazo client).
 * Returns a 6-char code that expires in 10 minutes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { randomBytes } from 'crypto'
import { withServiceCall } from '@/app/lib/observe'

const CODE_TTL_MINUTES = 10

async function POSTHandler(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  const code = randomBytes(3).toString('hex').toUpperCase() // 6 chars, e.g. "A3F1B2"
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString()

  const firestore = getAdminFirestore()
  await firestore.collection('telegramLinkCodes').doc(code).set({
    uid: guard.uid,
    expiresAt,
    createdAt: new Date().toISOString(),
  })

  return NextResponse.json({
    success: true,
    code,
    expiresIn: CODE_TTL_MINUTES * 60,
  })
}

/**
 * GET /api/telegram/link-code — check if user has an active Telegram link.
 */
async function GETHandler(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  const firestore = getAdminFirestore()
  const linksQuery = await firestore
    .collection('telegramLinks')
    .where('uid', '==', guard.uid)
    .get()

  const links = linksQuery.docs.map(doc => {
    const data = doc.data()
    return {
      chatId: data.telegramChatId,
      chatType: data.chatType,
      displayName: data.displayName || '',
      linkedAt: data.linkedAt,
    }
  })

  return NextResponse.json({ success: true, links })
}

export const POST = withServiceCall(POSTHandler)
export const GET = withServiceCall(GETHandler)
