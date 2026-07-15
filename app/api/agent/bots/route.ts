import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { withServiceCall } from '@/app/lib/observe'

function generateHandle(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let handle = 'bot-'
  for (let i = 0; i < 8; i++) {
    handle += chars[Math.floor(Math.random() * chars.length)]
  }
  return handle
}

function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/** GET /api/agent/bots — list user's bots */
async function GETHandler(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  const firestore = getAdminFirestore()
  const snapshot = await firestore
    .collection(`users/${guard.uid}/bots`)
    .orderBy('createdAt', 'desc')
    .get()

  const bots = snapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name,
    handle: doc.data().handle,
    createdAt: doc.data().createdAt,
  }))

  return NextResponse.json({ success: true, bots })
}

/** POST /api/agent/bots — create a new bot */
async function POSTHandler(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  const { name } = await request.json()
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Bot name is required' }, { status: 400 })
  }

  const handle = generateHandle()
  const token = generateToken()
  const tokenHash = await hashToken(token)

  const firestore = getAdminFirestore()
  const botRef = await firestore.collection(`users/${guard.uid}/bots`).add({
    name: name.trim(),
    handle,
    tokenHash,
    createdAt: new Date().toISOString(),
  })

  // Return the plain token once — it won't be retrievable again
  return NextResponse.json({
    success: true,
    bot: {
      id: botRef.id,
      name: name.trim(),
      handle,
      token,
      createdAt: new Date().toISOString(),
    },
  })
}

export const GET = withServiceCall(GETHandler)
export const POST = withServiceCall(POSTHandler)
