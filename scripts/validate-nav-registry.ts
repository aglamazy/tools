/**
 * Validates app/services/navConcierge/registry.ts against the real route
 * tree and tab definitions, so a screen rename/move fails this check
 * instead of silently going stale.
 *
 * Usage: npx tsx scripts/validate-nav-registry.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { NAV_REGISTRY, type NavRegistryEntry } from '../app/services/navConcierge/registry'

const ROOT = path.resolve(__dirname, '..')
const APP_DIR = path.join(ROOT, 'app')

function isDynamicSegment(segment: string): boolean {
  return /^\{.*\}$/.test(segment) || /^\[.*\]$/.test(segment)
}

// Walk app/ collecting every URL segment path that resolves to a page.tsx,
// skipping api routes and treating (group) folders as zero-URL-segment.
function collectRoutes(dir: string, urlSegments: string[], routes: string[][]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  if (entries.some((e) => e.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(e.name))) {
    routes.push(urlSegments)
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'api') continue
    if (entry.name.startsWith('_')) continue
    const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
    const nextSegments = isGroup ? urlSegments : [...urlSegments, entry.name]
    collectRoutes(path.join(dir, entry.name), nextSegments, routes)
  }
}

function routeMatches(routeSegments: string[], entrySegments: string[]): boolean {
  if (routeSegments.length !== entrySegments.length) return false
  return routeSegments.every((routeSeg, i) => {
    const entrySeg = entrySegments[i]
    if (isDynamicSegment(routeSeg) || isDynamicSegment(entrySeg)) return true
    return routeSeg === entrySeg
  })
}

function checkTabExists(tabOwnerFile: string, tabId: string): boolean {
  const filePath = path.join(ROOT, tabOwnerFile)
  if (!fs.existsSync(filePath)) return false
  const content = fs.readFileSync(filePath, 'utf8')
  const pattern = new RegExp(`id:\\s*['"]${tabId}['"]`)
  return pattern.test(content)
}

function validateEntry(entry: NavRegistryEntry, routes: string[][]): string[] {
  const errors: string[] = []
  const [pathname, query = ''] = entry.path.split('?')
  const entrySegments = pathname.split('/').filter(Boolean)

  const hasBusinessIdSegment = entrySegments.includes('{businessId}')
  if (entry.requiresBusinessId && !hasBusinessIdSegment) {
    errors.push(`requiresBusinessId is true but path has no {businessId} segment: ${entry.path}`)
  }
  if (!entry.requiresBusinessId && hasBusinessIdSegment) {
    errors.push(`path has a {businessId} segment but requiresBusinessId is not set: ${entry.path}`)
  }

  const matched = routes.some((routeSegments) => routeMatches(routeSegments, entrySegments))
  if (!matched) {
    errors.push(`no page.tsx in the route tree matches pathname "/${entrySegments.join('/')}"`)
  }

  const tabId = new URLSearchParams(query).get('tab')
  if (tabId && entry.tabOwnerFile) {
    if (!checkTabExists(entry.tabOwnerFile, tabId)) {
      errors.push(`tab id "${tabId}" not found in ${entry.tabOwnerFile}`)
    }
  }
  if (tabId && !entry.tabOwnerFile) {
    errors.push(`path has ?tab=${tabId} but no tabOwnerFile is set to validate it against`)
  }

  if (entry.addressable === false && !entry.gap) {
    errors.push('addressable is false but gap is not documented')
  }

  return errors
}

function main() {
  const routes: string[][] = []
  collectRoutes(APP_DIR, [], routes)

  const seenIds = new Set<string>()
  let failures = 0

  for (const entry of NAV_REGISTRY) {
    if (seenIds.has(entry.id)) {
      console.error(`✗ ${entry.id}: duplicate id`)
      failures++
      continue
    }
    seenIds.add(entry.id)

    const errors = validateEntry(entry, routes)
    if (errors.length > 0) {
      failures++
      console.error(`✗ ${entry.id} (${entry.path})`)
      for (const err of errors) console.error(`    ${err}`)
    }
  }

  const passed = NAV_REGISTRY.length - failures
  console.log(`\n${passed}/${NAV_REGISTRY.length} nav registry entries valid`)

  if (failures > 0) {
    console.error(`${failures} entr${failures === 1 ? 'y' : 'ies'} failed validation`)
    process.exit(1)
  }
}

main()
