import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `צור קשר | ${branding.name}`,
  description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: `צור קשר | ${branding.name}`,
    description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
    url: '/contact',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: `צור קשר | ${branding.name}`,
  description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
  url: 'https://aglamazo.com/contact',
  inLanguage: 'he',
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
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
