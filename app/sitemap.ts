import fs from 'fs'
import path from 'path'
import type { MetadataRoute } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aglamazo.com'
const normalizedBase = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl

/** Directories under app/ that are NOT public pages */
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

/** Routes that should not appear in the sitemap (e.g. require query params) */
const EXCLUDED_ROUTES = new Set(['/invite'])

interface DiscoveredRoute {
  routePath: string
  lastModified: Date
}

function latestMtime(dir: string): Date {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  let latest = fs.statSync(dir).mtime
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/^(page|layout)\.(tsx?|jsx?)$/.test(entry.name)) continue
    const stat = fs.statSync(path.join(dir, entry.name))
    if (stat.mtime > latest) latest = stat.mtime
  }
  return latest
}

function discoverPublicRoutes(dir: string, basePath = ''): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  const pageFile = entries.find(
    (e) => e.isFile() && /^page\.(tsx?|jsx?)$/.test(e.name)
  )
  if (pageFile) {
    const routePath = basePath || '/'
    if (!EXCLUDED_ROUTES.has(routePath)) {
      routes.push({ routePath, lastModified: latestMtime(dir) })
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    if (basePath === '' && EXCLUDED_DIRS.has(entry.name)) continue
    if (entry.name.startsWith('[')) continue

    routes.push(...discoverPublicRoutes(path.join(dir, entry.name), `${basePath}/${entry.name}`))
  }

  return routes
}

/** Higher-priority routes that should be crawled first */
const HIGH_PRIORITY_ROUTES = new Set(['/', '/about', '/pricing', '/guide', '/contact', '/demo-form', '/form-filler', '/terms'])

/** Routes that should not appear in the sitemap (personalized / requires auth) */
const NOINDEX_ROUTES = new Set(['/share-invite'])

export default function sitemap(): MetadataRoute.Sitemap {
  const appDir = path.join(process.cwd(), 'app')
  const routes = discoverPublicRoutes(appDir)

  return routes
    .filter(({ routePath }) => !NOINDEX_ROUTES.has(routePath))
    .map(({ routePath, lastModified }) => {
      const isHome = routePath === '/'
      const isHighPriority = HIGH_PRIORITY_ROUTES.has(routePath)

      return {
        url: `${normalizedBase}${isHome ? '/' : routePath}`,
        lastModified,
        changeFrequency: isHome ? 'weekly' : isHighPriority ? 'weekly' : 'monthly',
        priority: isHome ? 1.0 : isHighPriority ? 0.8 : 0.6,
      }
    })
}
