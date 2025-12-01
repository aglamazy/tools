import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tools.aglamaz.com'
const normalizedBase = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    {
      url: `${normalizedBase}/`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${normalizedBase}/about`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ]
}
