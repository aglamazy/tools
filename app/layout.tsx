import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import Sidebar from './components/Sidebar'
import PageHeader from './components/PageHeader'
import { ToastProvider } from './components/ToastContainer'
import MigrationRunner from './components/MigrationRunner'
import AuthInitializer from './components/AuthInitializer'
import CloudSyncManager from './components/CloudSyncManager'
import StationLockManager from './components/StationLockManager'

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
  title: 'ארגז כלים פיננסיים',
  description: 'כלים פיננסיים לניהול תשלומים ותקציב.',
  manifest: '/manifest.json',
  themeColor: '#4338ca',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ארגז כלים',
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ארגז כלים פיננסיים',
    description: 'כלים פיננסיים לניהול תשלומים ותקציב.',
    url: '/',
    siteName: 'ארגז כלים',
    type: 'website',
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he">
      <body>
        <ToastProvider>
          <MigrationRunner />
          <AuthInitializer />
          <CloudSyncManager />
          <StationLockManager />
          <PageHeader />
          <div className="app-layout">
            <Sidebar />
            <div className="main-content">
              {children}
            </div>
          </div>
          <Analytics />
        </ToastProvider>
      </body>
    </html>
  )
}
