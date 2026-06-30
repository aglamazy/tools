import fs from 'fs'
import path from 'path'
import type { MetadataRoute } from 'next'
import routeLastmod from './route-lastmod.json'

export const dynamic = 'force-static'
export const revalidate = 3600

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aglamazo.com'
const normalizedBase = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl

const lastmodMap = routeLastmod as Record<string, string>
const fallbackLastmodIso = lastmodMap.__fallback__ ?? new Date().toISOString()

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

function resolveLastmod(routePath: string, dir: string): Date {
  const mapped = lastmodMap[routePath]
  if (mapped) {
    const d = new Date(mapped)
    if (!Number.isNaN(d.getTime())) return d
  }
  // Fallback to filesystem mtime (less stable across deploys, but better than nothing)
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    let latest: Date | null = null
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!/^(page|layout)\.(tsx?|jsx?)$/.test(entry.name)) continue
      const stat = fs.statSync(path.join(dir, entry.name))
      if (!latest || stat.mtime > latest) latest = stat.mtime
    }
    if (latest) return latest
  } catch {
    // ignore
  }
  return new Date(fallbackLastmodIso)
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
      routes.push({ routePath, lastModified: resolveLastmod(routePath, dir) })
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

/** Content hub directory prefixes — sub-paths automatically get high priority once they exist */
const HIGH_PRIORITY_PREFIXES = ['/madrich/', '/template/', '/machshevon/']

/**
 * Routes that should not appear in the sitemap.
 * - /share-invite: personalized deep-link, not crawlable content
 * - /pay/success, /pay/failure: post-transaction result pages, not indexable
 * - /saliko, /saliko/privacy: cross-domain canonical (saliko.co.il) — these are Saliko's pages,
 *   not Aglamazo content; including them wastes crawl budget without benefit
 */
const NOINDEX_ROUTES = new Set(['/share-invite', '/pay/success', '/pay/failure', '/saliko', '/saliko/privacy'])

export default function sitemap(): MetadataRoute.Sitemap {
  const appDir = path.join(process.cwd(), 'app')
  const routes = discoverPublicRoutes(appDir)
  const logoUrl = `${normalizedBase}/logo.png`

  return routes
    .filter(({ routePath }) => !NOINDEX_ROUTES.has(routePath))
    .map(({ routePath, lastModified }) => {
      const isHome = routePath === '/'
      const isHighPriority =
        HIGH_PRIORITY_ROUTES.has(routePath) ||
        HIGH_PRIORITY_PREFIXES.some((prefix) => routePath.startsWith(prefix))
      const url = `${normalizedBase}${isHome ? '/' : routePath}`

      return {
        url,
        lastModified,
        changeFrequency: isHome ? 'weekly' : isHighPriority ? 'weekly' : 'monthly',
        priority: isHome ? 1.0 : isHighPriority ? 0.8 : 0.6,
        images: [logoUrl],
        alternates: {
          languages: {
            'he-IL': url,
            'x-default': url,
          },
        },
      }
    })
}
