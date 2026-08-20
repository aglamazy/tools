// PUBLIC ROUTE — health/version probe, no user data. Serves the build-stamped
// APP_VERSION + APP_COMMIT (fleet versioning standard, dasi#3 / aglamazo#315,
// saliko#28) so deploy-gate can assert post-deploy freshness against the
// RUNNING app.
//
// APP_VERSION/APP_COMMIT are derived at build time into app/lib/app-version.ts
// (scripts/generate-app-version.sh, wired as a prebuild step) — NOT read from
// process.env, which is never populated with these at Vercel runtime. The
// previous version of this route read process.env.APP_VERSION directly and
// always returned undefined for both fields; that gap is what this fixes.
import { NextResponse } from 'next/server'
import { APP_VERSION, APP_COMMIT } from '@/app/lib/app-version'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    // Field names match the fleet template's canonical shape (tools/templates/
    // app-version) — deploy-gate-version-check.sh and scripts/version_compliance.py
    // both parse "appVersion"/"appCommit" specifically, not "version"/"commit".
    appVersion: APP_VERSION,
    appCommit: APP_COMMIT,
  })
}
