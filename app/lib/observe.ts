/**
 * agents-observe wiring for Aglamazo (aglamazo#240).
 *
 * The lib reads AGENTS_OBSERVE_INGEST_URL / AGENTS_OBSERVE_TOKEN /
 * AGENTS_OBSERVE_PROJECT_ID, but the vars delivered to this app are named
 * SERVICE_CALL_INGEST_URL / SERVICE_CALL_INGEST_TOKEN (cockpit-side naming
 * — see .env.local). Map them explicitly here at call time rather than
 * duplicating the same secret under two env-var names. Every API route
 * should import `withServiceCall` from THIS module (not `agents-observe/next`
 * directly) so the mapping is applied everywhere automatically.
 *
 * Scope: unexpected 5xx only. `report4xx` is intentionally left at its
 * library default (false) — business-rule 4xx (e.g. "order too small") are
 * reflected to the user, never ticketed to Medic.
 */
import { withServiceCall as withServiceCallBase } from 'agents-observe/next'
import type { WithServiceCallOptions } from 'agents-observe/next'
import type { ObserveConfig } from 'agents-observe'

export function getObserveConfig(): ObserveConfig {
  return {
    ingestUrl: process.env.SERVICE_CALL_INGEST_URL,
    token: process.env.SERVICE_CALL_INGEST_TOKEN,
    projectId: 'aglamazo',
    env: process.env.VERCEL_ENV || process.env.NODE_ENV,
  }
}

export function withServiceCall<Args extends unknown[], Res>(
  handler: (req: any, ...args: Args) => Res | Promise<Res>,
  options?: WithServiceCallOptions
): (req: any, ...args: Args) => Res | Promise<Res> {
  return withServiceCallBase(handler, {
    ...options,
    config: { ...getObserveConfig(), ...options?.config },
  })
}
