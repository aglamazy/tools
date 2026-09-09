import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

export const dynamic = 'force-static'

const PAGE_DATE_MODIFIED = '2026-09-09'
const PAGE_DATE_PUBLISHED = '2026-09-09'

export const metadata: Metadata = {
  title: `מדיניות פרטיות | ${branding.name}`,
  description: `מדיניות הפרטיות של ${branding.name}. איך נשמר, מעובד ומשותף המידע שלכם.`,
  keywords: ['מדיניות פרטיות Aglamazo', 'privacy policy', 'הגנת מידע', 'Google OAuth', 'שימוש בבינה מלאכותית'],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 } },
  alternates: {
    canonical: '/privacy',
    languages: {
      'he-IL': '/privacy',
      'x-default': '/privacy',
    },
  },
  openGraph: {
    title: `מדיניות פרטיות | ${branding.name}`,
    description: `מדיניות הפרטיות של ${branding.name}. איך נשמר, מעובד ומשותף המידע שלכם.`,
    url: '/privacy',
    siteName: branding.name,
    type: 'website',
    locale: 'he_IL',
    images: [{ url: '/logo.png', width: 2816, height: 1536, alt: `${branding.name} - מדיניות פרטיות` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `מדיניות פרטיות | ${branding.name}`,
    description: `מדיניות הפרטיות של ${branding.name}.`,
    images: ['/logo.png'],
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `מדיניות פרטיות | ${branding.name}`,
    description: `מדיניות הפרטיות של ${branding.name}. איך נשמר, מעובד ומשותף המידע שלכם.`,
    url: 'https://aglamazo.com/privacy',
    inLanguage: 'he-IL',
    datePublished: PAGE_DATE_PUBLISHED,
    dateModified: PAGE_DATE_MODIFIED,
    isPartOf: { '@type': 'WebSite', name: branding.name, url: 'https://aglamazo.com/' },
    primaryImageOfPage: { '@type': 'ImageObject', url: 'https://aglamazo.com/logo.png' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: branding.name, item: 'https://aglamazo.com/' },
      { '@type': 'ListItem', position: 2, name: 'מדיניות פרטיות', item: 'https://aglamazo.com/privacy' },
    ],
  },
]

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
      <nav dir="rtl" style={{ maxWidth: '700px', margin: '0 auto', padding: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#1e293b' }}>עמודים נוספים</h3>
        <ul style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          <li><Link href="/about" style={{ color: '#4338ca' }}>אודות</Link></li>
          <li><Link href="/guide" style={{ color: '#4338ca' }}>מדריך שימוש</Link></li>
          <li><Link href="/pricing" style={{ color: '#4338ca' }}>מחירים</Link></li>
          <li><Link href="/terms" style={{ color: '#4338ca' }}>תנאי שימוש</Link></li>
          <li><Link href="/contact" style={{ color: '#4338ca' }}>צור קשר</Link></li>
        </ul>
      </nav>
      <noscript>
        <div dir="rtl" style={{ maxWidth: '700px', margin: '2rem auto', padding: '2rem' }}>
          <h1>מדיניות פרטיות | {branding.name}</h1>
          <p>
            {branding.name} הוא שירות לניהול פיננסי חכם. הנתונים הפיננסיים נשמרים בדפדפן שלכם בלבד.
            קראו את מדיניות הפרטיות המלאה לפני השימוש בשירות.
          </p>
        </div>
      </noscript>
    </>
  )
}
