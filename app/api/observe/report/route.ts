// PUBLIC ROUTE — accepts client-side error reports from global-error.tsx and
// forwards to the cockpit ingest using server-side AGENTS_OBSERVE_* env vars.
// This is the "report-through-server" design: the ingest token never leaks to
// the browser. NOT wrapped with withServiceCall (it is the observer itself).
import { type NextRequest, NextResponse } from 'next/server'
import { reportFault } from 'agents-observe'

export async function POST(request: NextRequest) {
  let body: { message?: string; errorClass?: string; route?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  // Fire-and-forget — never let this block the client
  reportFault({
    status: 500,
    route: body.route ?? '(client)',
    error_class: body.errorClass,
    message: body.message,
  }).catch(() => undefined)

  return NextResponse.json({ ok: true })
}
