#!/usr/bin/env node
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const appDir = path.join(repoRoot, 'app')
const outFile = path.join(appDir, 'route-lastmod.json')

const EXCLUDED_DIRS = new Set([
  '(dashboard)',
  'api',
  'extension',
  'components',
  'services',
  'stores',
  'db',
  'lib',
  'utils',
  'types',
])
const EXCLUDED_ROUTES = new Set(['/invite'])

function discoverRoutes(dir, basePath = '') {
  const routes = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const pageFiles = entries.filter((e) => e.isFile() && /^(page|layout)\.(tsx?|jsx?)$/.test(e.name))
  const hasPage = pageFiles.some((e) => /^page\./.test(e.name))
  if (hasPage) {
    const routePath = basePath || '/'
    if (!EXCLUDED_ROUTES.has(routePath)) {
      const files = pageFiles.map((e) => path.join(dir, e.name))
      routes.push({ routePath, files })
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    if (basePath === '' && EXCLUDED_DIRS.has(entry.name)) continue
    if (entry.name.startsWith('[')) continue
    routes.push(...discoverRoutes(path.join(dir, entry.name), `${basePath}/${entry.name}`))
  }
  return routes
}

function gitLastModified(files) {
  let latest = null
  for (const file of files) {
    try {
      const rel = path.relative(repoRoot, file)
      const out = execSync(`git log -1 --format=%cI -- "${rel}"`, { cwd: repoRoot, encoding: 'utf8' }).trim()
      if (out) {
        const d = new Date(out)
        if (!Number.isNaN(d.getTime()) && (!latest || d > latest)) latest = d
      }
    } catch {
      // ignore
    }
  }
  return latest
}

const routes = discoverRoutes(appDir)
const map = {}
for (const { routePath, files } of routes) {
  const d = gitLastModified(files)
  if (d) map[routePath] = d.toISOString()
}

// Also record a repo-wide fallback (latest commit overall)
try {
  const out = execSync('git log -1 --format=%cI', { cwd: repoRoot, encoding: 'utf8' }).trim()
  if (out) map.__fallback__ = new Date(out).toISOString()
} catch {
  map.__fallback__ = new Date().toISOString()
}

fs.writeFileSync(outFile, JSON.stringify(map, null, 2) + '\n', 'utf8')
console.log(`Wrote ${Object.keys(map).length - 1} route lastmod entries to ${path.relative(repoRoot, outFile)}`)
