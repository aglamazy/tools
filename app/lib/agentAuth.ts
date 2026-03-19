/**
 * Bot authentication helper for agent API routes.
 *
 * Bots authenticate with:
 *   X-Bot-Handle: <handle>
 *   Authorization: Bearer <token>
 *
 * We find the user who owns the bot by handle, then verify SHA-256(token) matches.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore, isAdminConfigured } from '@/app/lib/firebaseAdmin'

export type BotAuthResult =
  | { uid: string; botId: string; botHandle: string; error?: undefined }
  | { uid?: undefined; botId?: undefined; botHandle?: undefined; error: NextResponse }

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Authenticate a bot request.
 * Searches all users' bot sub-collections to find the matching handle,
 * then verifies the token hash.
 */
export async function requireBotAuth(request: NextRequest): Promise<BotAuthResult> {
  if (!isAdminConfigured()) {
    return { error: NextResponse.json({ error: 'Server not configured' }, { status: 500 }) }
  }

  const botHandle = request.headers.get('X-Bot-Handle')
  const authHeader = request.headers.get('Authorization')

  if (!botHandle) {
    return { error: NextResponse.json({ error: 'Missing X-Bot-Handle header' }, { status: 401 }) }
  }
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 }) }
  }

  const token = authHeader.slice(7)
  const tokenHash = await hashToken(token)

  const firestore = getAdminFirestore()

  // Query across all users' bots sub-collections using collection group query
  const botsQuery = await firestore
    .collectionGroup('bots')
    .where('handle', '==', botHandle)
    .limit(1)
    .get()

  if (botsQuery.empty) {
    return { error: NextResponse.json({ error: 'Bot not found' }, { status: 401 }) }
  }

  const botDoc = botsQuery.docs[0]
  const botData = botDoc.data()

  if (botData.tokenHash !== tokenHash) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }

  // Extract uid from the document path: users/{uid}/bots/{botId}
  const pathParts = botDoc.ref.path.split('/')
  const uid = pathParts[1]

  return { uid, botId: botDoc.id, botHandle }
}
