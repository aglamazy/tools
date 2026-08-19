// PUBLIC ROUTE — health/version probe, no user data. Serves the build-stamped
// APP_VERSION + APP_COMMIT (fleet versioning standard, dasi#3 / aglamazo#315)
// so deploy-gate can assert post-deploy freshness against the RUNNING app.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: process.env.APP_VERSION,
    commit: process.env.APP_COMMIT,
  })
}
