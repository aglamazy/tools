import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'
export const revalidate = 3600

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aglamazo.com'
const normalizedBase = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app/', '/admin', '/release-notes/'] }],
    sitemap: `${normalizedBase}/sitemap.xml`,
    host: normalizedBase,
  }
}
