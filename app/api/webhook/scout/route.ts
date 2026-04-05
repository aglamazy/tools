// CALLER-KEYED ROUTE
import { NextRequest, NextResponse } from 'next/server'
import { requireBotAuth } from '@/app/lib/agentAuth'
import { getAdminFirestore } from '@/app/lib/firebaseAdmin'

const VALID_PRIORITIES = ['low', 'medium', 'high']
const VALID_CLASSIFICATIONS = ['LEAD', 'MENTION', 'COMPETITOR', 'INSIGHT']

const SOURCE_EMOJI: Record<string, string> = {
  reddit: '🔴',
  twitter: '🐦',
  linkedin: '🔗',
  hackernews: '🟠',
}

/**
 * POST /api/webhook/scout — create a lead task from an external scout.
 * Uses bot auth (X-Bot-Handle + Bearer token).
 * Creates an agentTask in Firestore with lead metadata in ext field.
 */
export async function POST(request: NextRequest) {
  let auth
  try {
    auth = await requireBotAuth(request)
  } catch (err: any) {
    console.error('[Scout Webhook] requireBotAuth error:', err.code, err.details, err.message)
    return NextResponse.json({ error: 'Auth failed', details: err.message, code: err.code }, { status: 500 })
  }
  if (auth.error) return auth.error

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { source, title, description, url, classification, score, suggested_reply, priority, tags } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 })
  }

  if (!source || typeof source !== 'string') {
    return NextResponse.json({ error: 'Missing required field: source' }, { status: 400 })
  }

  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` }, { status: 400 })
  }

  if (classification && !VALID_CLASSIFICATIONS.includes(classification)) {
    return NextResponse.json({ error: `Invalid classification. Must be one of: ${VALID_CLASSIFICATIONS.join(', ')}` }, { status: 400 })
  }

  if (tags && !Array.isArray(tags)) {
    return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 })
  }

  const emoji = SOURCE_EMOJI[source.toLowerCase()] || '🎯'
  const sourceName = source.charAt(0).toUpperCase() + source.slice(1).toLowerCase()
  const taskTitle = `${emoji} [${sourceName}] ${title.trim()}`

  const quadrant = classification === 'LEAD' ? 'do' : 'schedule'

  const now = new Date().toISOString()
  const firestore = getAdminFirestore()

  const taskData = {
    botId: auth.botId,
    botHandle: auth.botHandle,
    localTaskId: 0,
    title: taskTitle.slice(0, 200),
    description: (description || '').slice(0, 2000),
    priority: priority || 'medium',
    quadrant,
    status: 'pending',
    result: null,
    subject: 'Scout Leads',
    tags: tags || [source.toLowerCase()],
    source: 'webhook',
    ext: {
      type: 'lead',
      source: source.toLowerCase(),
      url: url || null,
      classification: classification || null,
      score: typeof score === 'number' ? score : null,
      suggestedReply: suggested_reply || null,
    },
    createdAt: now,
    updatedAt: now,
  }

  const docRef = await firestore
    .collection(`users/${auth.uid}/agentTasks`)
    .add(taskData)

  console.log(`[Scout Webhook] Created lead task ${docRef.id} from ${source} for user ${auth.uid}`)

  return NextResponse.json({
    success: true,
    taskId: docRef.id,
  }, { status: 201 })
}
