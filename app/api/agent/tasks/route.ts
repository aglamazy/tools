// CALLER-KEYED ROUTE
import { NextRequest, NextResponse } from 'next/server'
import { requireBotAuth } from '@/app/lib/agentAuth'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { withServiceCall } from '@/app/lib/observe'

/** GET /api/agent/tasks — bot polls for its pending tasks */
async function GETHandler(request: NextRequest) {
  const auth = await requireBotAuth(request)
  if (auth.error) return auth.error

  const firestore = getAdminFirestore()
  const snapshot = await firestore
    .collection(`users/${auth.uid}/agentTasks`)
    .where('botId', '==', auth.botId)
    .where('status', 'in', ['pending', 'in_progress'])
    .orderBy('createdAt', 'asc')
    .get()

  const tasks = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }))

  return NextResponse.json({ success: true, tasks })
}

export const GET = withServiceCall(GETHandler)
