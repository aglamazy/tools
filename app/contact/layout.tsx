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

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: `צור קשר | ${branding.name}`,
    description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
    url: 'https://aglamazo.com/contact',
    inLanguage: 'he',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: branding.name, item: 'https://aglamazo.com/' },
      { '@type': 'ListItem', position: 2, name: 'צור קשר', item: 'https://aglamazo.com/contact' },
    ],
  },
]

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
      <noscript>
        <div dir="rtl" style={{ maxWidth: '600px', margin: '2rem auto', padding: '2rem' }}>
          <h1>צור קשר | {branding.name}</h1>
          <p>צרו קשר עם צוות {branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.</p>
          <p>שלחו אימייל ל-<a href="mailto:support@aglamaz.com">support@aglamaz.com</a></p>
        </div>
      </noscript>
    </>
  )
}
