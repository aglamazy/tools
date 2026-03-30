import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `הזמנה | ${branding.name}`,
  description: `הצטרפו ל-${branding.name} לניהול פיננסי משותף. קבלו הזמנה וגשו לניהול התקציב של המשק בית.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/invite',
  },
  openGraph: {
    title: `הזמנה | ${branding.name}`,
    description: `הצטרפו ל-${branding.name} לניהול פיננסי משותף. קבלו הזמנה וגשו לניהול התקציב של המשק בית.`,
    url: '/invite',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: `הזמנה | ${branding.name}`,
  description: `הצטרפו ל-${branding.name} לניהול פיננסי משותף.`,
  url: 'https://aglamazo.com/invite',
  inLanguage: 'he',
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  )
}
