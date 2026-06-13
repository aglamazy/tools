/**
 * /api/_firedrill — synthetic prod-log fault for verifying Ant's vercel-audit.
 *
 * Curling this endpoint throws at runtime so the Vercel error log captures a
 * level=error line tagged [FIREDRILL]. Endpoint is non-customer-facing (no
 * link, no nav, underscore prefix) and trivially revertible by deleting this
 * file. Slated for immediate revert after the audit verification window.
 *
 * Authored 2026-06-13 (Agla go #2792, General lane).
 */
export const dynamic = 'force-dynamic'

// PUBLIC ROUTE
export async function GET() {
  console.error('[FIREDRILL] synthetic prod-log error to verify vercel-audit', { ts: Date.now() })
  throw new Error('FIREDRILL synthetic fault for vercel-audit verification — General lane')
}
