// PUBLIC ROUTE — relay for app/global-error.tsx's client fault reports.
// Must work even when auth/session state is broken, since that's exactly
// the condition under which a client render can crash. Never trust the
// body beyond shape-checking; re-signs with the real server-only
// SERVICE_CALL_INGEST_TOKEN before forwarding to the cockpit (the browser
// never sees that token — see app/global-error.tsx and app/lib/observe.ts).
import { NextRequest, NextResponse } from 'next/server'
import { reportFault } from 'agents-observe'
import { withServiceCall, getObserveConfig } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'invalid body' }, { status: 400 })
  }

  await reportFault(
    {
      status: typeof body.status === 'number' ? body.status : 500,
      route: typeof body.route === 'string' ? body.route : undefined,
      method: typeof body.method === 'string' ? body.method : undefined,
      error_class: typeof body.error_class === 'string' ? body.error_class : undefined,
      message: typeof body.message === 'string' ? body.message : undefined,
      project_id: 'aglamazo',
    },
    { config: getObserveConfig(), await: true }
  )

  return NextResponse.json({ success: true })
}

export const POST = withServiceCall(POSTHandler)
