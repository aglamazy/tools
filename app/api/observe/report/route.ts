// PUBLIC ROUTE — accepts client-side error reports from global-error.tsx and
// forwards to the cockpit ingest using server-side AGENTS_OBSERVE_* env vars.
// This is the "report-through-server" design: the ingest token never leaks to
// the browser. NOT wrapped with withServiceCall (it is the observer itself).
import { type NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { reportFault } from 'agents-observe'

export async function POST(request: NextRequest) {
  let body: { message?: string; errorClass?: string; route?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // Dispatched via after(), not a bare void fire-and-forget: on Vercel Node
  // serverless the function can suspend the instant this handler returns,
  // before an in-flight forward-to-cockpit fetch completes -- after() keeps
  // the instance alive until the report genuinely lands, without delaying
  // this response (#P0-observe-waituntil hop 2, 2026-08-15 wet-test round 3;
  // see agents-observe's README "Server-side report proxy" section).
  after(
    reportFault(
      {
        status: 500,
        route: body.route ?? '(client)',
        error_class: body.errorClass,
        message: body.message,
      },
      { await: true },
    ).catch(() => undefined),
  )

  return NextResponse.json({ ok: true })
}
