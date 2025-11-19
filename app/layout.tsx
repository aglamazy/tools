import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

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
  title: 'Future Payments Forecast',
  description: 'Upload your credit card statement to forecast upcoming installment charges.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Future Payments Forecast',
    description: 'Upload your credit card statement to forecast upcoming installment charges.',
    url: '/',
    siteName: 'Tools',
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
        {children}
        <Analytics />
      </body>
    </html>
  )
}
