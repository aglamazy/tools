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

function discoverPublicRoutes(dir: string, basePath = ''): string[] {
  const routes: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  const hasPage = entries.some(
    (e) => e.isFile() && /^page\.(tsx?|jsx?)$/.test(e.name)
  )
  if (hasPage) {
    routes.push(basePath || '/')
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    if (basePath === '' && EXCLUDED_DIRS.has(entry.name)) continue
    // Skip dynamic route segments like [id]
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

  return routes.map((route) => {
    const isHome = route === '/'
    const isHighPriority = HIGH_PRIORITY_ROUTES.has(route)

    return {
      url: `${normalizedBase}${isHome ? '/' : route}`,
      lastModified: new Date('2026-03-30'),
      changeFrequency: (isHome ? 'weekly' : isHighPriority ? 'monthly' : 'yearly') as const,
      priority: isHome ? 1.0 : isHighPriority ? 0.8 : 0.6,
    }
  })
}
