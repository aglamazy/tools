#!/usr/bin/env node
// Registers this project's dead-man checks (dead-man-checks.json) on a Cockpit
// hub — `npm run pre-deploy`. Register and confirm BEFORE the job's own ping is
// switched on: a ping for an unregistered slug is a 404 and an alert.
//
//   OCTOPUS_DEADMAN_BASE_URL   the hub to register on. REQUIRED — this script
//                              never falls back to the production hub.
//   DEADMAN_REGISTER_TOKEN     the registration token (load it from its env
//                              file; never put it in argv, a log or a commit).
//   <slugEnv per check>        each check's slug, named in dead-man-checks.json.
//
// --dry-run validates the configuration and prints which checks and which hub,
// without sending anything. Slugs and the token are never printed.
import fs from 'node:fs'
import { registerDeadman } from 'agents-observe'

function fail(message) {
  console.error(`pre-deploy: ${message}`)
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const config = JSON.parse(fs.readFileSync(new URL('../dead-man-checks.json', import.meta.url), 'utf8'))

const base = process.env.OCTOPUS_DEADMAN_BASE_URL
if (!base) fail('OCTOPUS_DEADMAN_BASE_URL is not set. Set it to the hub you mean to register on — this script has no default.')
let host
try {
  host = new URL(base).host
} catch {
  fail('OCTOPUS_DEADMAN_BASE_URL is not a valid URL')
}
if (!dryRun && !process.env.DEADMAN_REGISTER_TOKEN) fail('DEADMAN_REGISTER_TOKEN is not set')

const checks = config.checks.map((check) => {
  const slug = process.env[check.slugEnv]
  if (!slug) fail(`${check.slugEnv} is not set (check "${check.name}")`)
  return { slug, period_seconds: check.period_seconds, grace_seconds: check.grace_seconds }
})

console.log(`pre-deploy: ${dryRun ? 'would register' : 'registering'} ${checks.length} check(s) on ${host}: ${config.checks.map((c) => c.name).join(', ')}`)
if (dryRun) process.exit(0)

const outcome = await registerDeadman({ owning_lane: config.owning_lane, checks })
if (!outcome.ok) {
  fail(`registration failed: ${outcome.reason}${outcome.status ? ` (HTTP ${outcome.status})` : ''}${outcome.error ? ` ${outcome.error}` : ''}`)
}
console.log(`pre-deploy: ${outcome.created.length} created, ${outcome.existing.length} already registered`)
