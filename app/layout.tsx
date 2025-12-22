import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import Sidebar from './components/Sidebar'
import PageHeader from './components/PageHeader'
import { ToastProvider } from './components/ToastContainer'
import MigrationRunner from './components/MigrationRunner'
import DriveSetupGate from './components/DriveSetupGate'
import StationLockManager from './components/StationLockManager'
import DriveSyncManager from './components/DriveSyncManager'

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
          <DriveSetupGate>
            <StationLockManager />
            <DriveSyncManager />
            <PageHeader />
            <div className="app-layout">
              <Sidebar />
              <div className="main-content">
                {children}
              </div>
            </div>
          </DriveSetupGate>
          <Analytics />
        </ToastProvider>
      </body>
    </html>
  )
}
