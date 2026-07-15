// CALLER-KEYED ROUTE
import { NextRequest, NextResponse } from 'next/server'
import { requireBotAuth } from '@/app/lib/agentAuth'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'
import { withServiceCall } from '@/app/lib/observe'

type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/agent/tasks/[id] — bot updates task status + result */
async function PATCHHandler(request: NextRequest, context: RouteContext) {
  const auth = await requireBotAuth(request)
  if (auth.error) return auth.error

  const { id } = await context.params
  const body = await request.json()

  const { status, result } = body
  const validStatuses = ['pending', 'in_progress', 'done', 'failed']
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const firestore = getAdminFirestore()
  const taskRef = firestore.doc(`users/${auth.uid}/agentTasks/${id}`)
  const taskDoc = await taskRef.get()

  if (!taskDoc.exists) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const taskData = taskDoc.data()!
  if (taskData.botId !== auth.botId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {
    status,
    updatedAt: new Date().toISOString(),
  }
  if (result !== undefined) {
    updates.result = result
  }

  await taskRef.update(updates)

  return NextResponse.json({ success: true })
}

export const PATCH = withServiceCall(PATCHHandler)
