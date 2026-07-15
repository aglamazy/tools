import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { withServiceCall } from '@/app/lib/observe'

type RouteContext = { params: Promise<{ id: string }> }

/** DELETE /api/agent/bots/[id] — remove a bot */
async function DELETEHandler(request: NextRequest, context: RouteContext) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error

  const { id } = await context.params

  const firestore = getAdminFirestore()
  const botRef = firestore.doc(`users/${guard.uid}/bots/${id}`)
  const botDoc = await botRef.get()

  if (!botDoc.exists) {
    return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
  }

  await botRef.delete()

  return NextResponse.json({ success: true })
}

export const DELETE = withServiceCall(DELETEHandler)
