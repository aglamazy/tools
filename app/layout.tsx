import { Analytics } from '@vercel/analytics/react'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import './layout.css'
import './components.css'
import './landing.css'
import './pages.css'
import { ToastProvider } from './components/ToastContainer'
import { branding } from './config'
import MigrationRunner from './components/MigrationRunner'
import AuthInitializer from './components/AuthInitializer'
import CloudSyncManager from './components/CloudSyncManager'
import PageHeader from './components/PageHeader'
import SiteFooter from './components/SiteFooter'

if (!process.env.NEXT_PUBLIC_SITE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SITE_URL environment variable')
}
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
const metadataBase = (() => {
  try {
    return new URL(siteUrl)
  } catch (error) {
    return undefined
  }
})()

export const metadata: Metadata = {
  metadataBase,
  title: branding.name,
  description: branding.tagline,
  manifest: '/manifest.json',
  verification: {
    google: 'PBaxmxYIxQXOOVSDCgPt9-Kd0CeHyPxcEXrlisDZSMU',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: branding.name,
  },
  openGraph: {
    title: branding.name,
    description: branding.tagline,
    url: '/',
    siteName: branding.name,
    type: 'website',
    images: [
      {
        url: '/logo.png',
        width: 2816,
        height: 1536,
        alt: branding.name,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: branding.name,
    description: branding.tagline,
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#4338ca',
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: branding.name,
    description: branding.tagline,
    url: siteUrl,
    inLanguage: 'he',
    publisher: {
      '@type': 'Organization',
      name: branding.name,
      url: siteUrl,
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: branding.name,
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    description: branding.tagline,
  },
]

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he">
      <head>
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ToastProvider>
          <MigrationRunner />
          <AuthInitializer />
          <CloudSyncManager />
          <PageHeader />
          {children}
          <SiteFooter />
          <Analytics />
        </ToastProvider>
      </body>
    </html>
  )
}
