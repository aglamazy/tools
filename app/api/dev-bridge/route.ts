// PUBLIC ROUTE
// Dev-only message bridge for cross-tab extension testing
// Returns 404 in production — never affects deployed behavior
import { NextResponse } from 'next/server'
import { withServiceCall } from '@/app/lib/observe'

const queues: Record<string, unknown[]> = { sidebar: [], form: [] }

const cors = { 'Access-Control-Allow-Origin': '*' }

async function GETHandler(req: Request) {
  if (process.env.NODE_ENV === 'production')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const target = new URL(req.url).searchParams.get('target') || 'sidebar'
  const messages = queues[target] || []
  if (messages.length === 0)
    return new NextResponse('{"messages":[]}', { headers: { ...cors, 'Content-Type': 'application/json' } })
  queues[target] = []
  return NextResponse.json({ messages }, { headers: cors })
}

async function POSTHandler(req: Request) {
  if (process.env.NODE_ENV === 'production')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { target, message } = await req.json()
  if (!queues[target]) queues[target] = []
  queues[target].push(message)
  return NextResponse.json({ ok: true }, { headers: cors })
}

async function OPTIONSHandler() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const GET = withServiceCall(GETHandler)
export const POST = withServiceCall(POSTHandler)
export const OPTIONS = withServiceCall(OPTIONSHandler)
