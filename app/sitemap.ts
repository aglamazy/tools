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

export default function sitemap(): MetadataRoute.Sitemap {
  const appDir = path.join(process.cwd(), 'app')
  const routes = discoverPublicRoutes(appDir)
  const lastModified = new Date()

  return routes.map((route) => ({
    url: `${normalizedBase}${route === '/' ? '/' : route}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: route === '/' ? 1 : 0.8,
  }))
}
