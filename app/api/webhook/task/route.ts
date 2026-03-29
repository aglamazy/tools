// CALLER-KEYED ROUTE
import { NextRequest, NextResponse } from 'next/server'
import { requireBotAuth } from '@/app/lib/agentAuth'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

const VALID_PRIORITIES = ['low', 'medium', 'high']
const VALID_QUADRANTS = ['do', 'schedule', 'delegate', 'eliminate']

/**
 * POST /api/webhook/task — create a task via webhook.
 * Uses bot auth (X-Bot-Handle + Bearer token).
 * Creates an agentTask in Firestore; the client auto-imports it into Dexie.
 */
export async function POST(request: NextRequest) {
  let auth
  try {
    auth = await requireBotAuth(request)
  } catch (err: any) {
    console.error('[Webhook] requireBotAuth error:', err.code, err.details, err.message)
    return NextResponse.json({ error: 'Auth failed', details: err.message, code: err.code }, { status: 500 })
  }
  if (auth.error) return auth.error

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { title, priority, quadrant, deadline, subject, tags } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 })
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` }, { status: 400 })
  }

  if (quadrant && !VALID_QUADRANTS.includes(quadrant)) {
    return NextResponse.json({ error: `Invalid quadrant. Must be one of: ${VALID_QUADRANTS.join(', ')}` }, { status: 400 })
  }

  if (deadline && isNaN(Date.parse(deadline))) {
    return NextResponse.json({ error: 'Invalid deadline format. Use ISO date (e.g. 2026-04-15)' }, { status: 400 })
  }

  if (tags && !Array.isArray(tags)) {
    return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const firestore = getAdminFirestore()

  const taskData = {
    botId: auth.botId,
    botHandle: auth.botHandle,
    localTaskId: 0, // signals webhook-created (no local task yet)
    title: title.trim(),
    description: '',
    priority: priority || 'medium',
    quadrant: quadrant || 'do',
    status: 'pending',
    result: null,
    // Extra fields for client-side Dexie import
    deadline: deadline || null,
    subject: subject || null,
    tags: tags || null,
    source: 'webhook',
    createdAt: now,
    updatedAt: now,
  }

  const docRef = await firestore
    .collection(`users/${auth.uid}/agentTasks`)
    .add(taskData)

  return NextResponse.json({
    success: true,
    taskId: docRef.id,
    message: 'Task created successfully',
  }, { status: 201 })
}
