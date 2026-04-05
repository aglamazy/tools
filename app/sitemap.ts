import fs from 'fs'
import path from 'path'
import type { MetadataRoute } from 'next'

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

interface RouteInfo {
  path: string
  lastModified: Date
}

function discoverPublicRoutes(dir: string, basePath = ''): RouteInfo[] {
  const routes: RouteInfo[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  const pageFile = entries.find(
    (e) => e.isFile() && /^page\.(tsx?|jsx?)$/.test(e.name)
  )
  if (pageFile) {
    const routePath = basePath || '/'
    if (!EXCLUDED_ROUTES.has(routePath)) {
      const filePath = path.join(dir, pageFile.name)
      const stat = fs.statSync(filePath)
      routes.push({ path: routePath, lastModified: stat.mtime })
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    if (basePath === '' && EXCLUDED_DIRS.has(entry.name)) continue
    if (entry.name.startsWith('[')) continue

    routes.push(
      ...discoverPublicRoutes(
        path.join(dir, entry.name),
        `${basePath}/${entry.name}`
      )
    )
  }

  return routes
}

/** Higher-priority routes that should be crawled first */
const HIGH_PRIORITY_ROUTES = new Set(['/', '/about', '/pricing', '/guide', '/contact'])

export default function sitemap(): MetadataRoute.Sitemap {
  const appDir = path.join(process.cwd(), 'app')
  const routes = discoverPublicRoutes(appDir)

  return routes.map(({ path: route, lastModified }) => {
    const isHome = route === '/'
    const isHighPriority = HIGH_PRIORITY_ROUTES.has(route)

    return {
      url: `${normalizedBase}${isHome ? '/' : route}`,
      lastModified,
      changeFrequency: isHome ? 'weekly' : isHighPriority ? 'monthly' : 'yearly',
      priority: isHome ? 1.0 : isHighPriority ? 0.8 : 0.6,
    }
  })
}
