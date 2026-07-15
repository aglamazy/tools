#!/usr/bin/env node

/**
 * Validate app/services/navConcierge/registry.ts against the actual route
 * tree — catches the failure mode this registry exists to prevent from
 * silently repeating on itself: a settings screen moves/renames and the
 * registry keeps pointing at a dead URL/tab, so find_setting confidently
 * hands out a broken link.
 *
 * Checks, per entry:
 *   1. The base path (before `?`) resolves to a real page.tsx under
 *      app/(dashboard)/app/... (route groups don't appear in the URL —
 *      {businessId} is treated as a dynamic segment).
 *   2. If the path has ?tab=X, that literal tab id string appears in the
 *      relevant tabs-definition file (Settings.tsx's `tabs` array, or
 *      BusinessPage.tsx's `activeTab === 'X'` checks) — so a renamed tab id
 *      fails loudly instead of silently going stale.
 *
 * Run: node scripts/check-nav-registry.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const REGISTRY_PATH = path.join(ROOT, 'app/services/navConcierge/registry.ts')
const SETTINGS_TABS_PATH = path.join(ROOT, 'app/components/Settings.tsx')
const BUSINESS_TABS_PATH = path.join(ROOT, 'app/components/business/BusinessPage.tsx')

const registrySrc = fs.readFileSync(REGISTRY_PATH, 'utf-8')
const settingsSrc = fs.readFileSync(SETTINGS_TABS_PATH, 'utf-8')
const businessSrc = fs.readFileSync(BUSINESS_TABS_PATH, 'utf-8')

// Extract { id, ..., path: '...' } tuples via a loose regex — this is a
// validation script, not a TS parser; good enough to catch drift without a
// build step. Re-check by hand if this ever silently returns 0 entries.
const entryRe = /\{\s*id:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'/g
const entries = []
let m
while ((m = entryRe.exec(registrySrc))) {
  entries.push({ id: m[1], path: m[2] })
}

if (entries.length === 0) {
  console.error('❌ Parsed 0 entries from registry.ts — regex drift? Check the file by hand.')
  process.exit(1)
}

const settingsTabIds = new Set(
  [...settingsSrc.matchAll(/id:\s*'([a-z-]+)'/g)].map((mm) => mm[1])
)
const businessTabIds = new Set(
  [...businessSrc.matchAll(/activeTab\s*===\s*'([a-z-]+)'/g)].map((mm) => mm[1])
)

let hasErrors = false

for (const { id, path: rawPath } of entries) {
  const [basePath, query] = rawPath.split('?')
  const segments = basePath.split('/').filter(Boolean) // e.g. ['app','business','{businessId}']

  // Map {businessId} (or any {placeholder}) to a dynamic-segment dir name.
  const fsSegments = segments.map((s) => (s.startsWith('{') ? '[id]' : s))
  const pageFile = path.join(ROOT, 'app/(dashboard)', ...fsSegments, 'page.tsx')

  if (!fs.existsSync(pageFile)) {
    console.error(`❌ [${id}] no page.tsx for "${basePath}" (looked for ${path.relative(ROOT, pageFile)})`)
    hasErrors = true
    continue
  }

  if (query) {
    const tabMatch = /tab=([a-z-]+)/.exec(query)
    if (tabMatch) {
      const tabId = tabMatch[1]
      const isBusinessRoute = segments.includes('business')
      const knownTabs = isBusinessRoute ? businessTabIds : settingsTabIds
      if (!knownTabs.has(tabId)) {
        console.error(`❌ [${id}] tab "${tabId}" not found in ${isBusinessRoute ? 'BusinessPage.tsx' : 'Settings.tsx'}`)
        hasErrors = true
        continue
      }
    }
  }

  console.log(`✅ [${id}] ${rawPath}`)
}

console.log('')
if (hasErrors) {
  console.error(`❌ nav registry has ${entries.length} entries, some are stale — fix before shipping.`)
  process.exit(1)
} else {
  console.log(`✅ All ${entries.length} nav registry entries resolve to real routes/tabs.`)
  process.exit(0)
}
