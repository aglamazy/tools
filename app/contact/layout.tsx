import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

const PAGE_DATE_MODIFIED = '2026-04-28'
const PAGE_DATE_PUBLISHED = '2026-03-29'

export const metadata: Metadata = {
  title: `צור קשר | ${branding.name}`,
  description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
  keywords: ['צור קשר Aglamazo', 'תמיכה Aglamazo', 'support@aglamaz.com', 'משוב', 'שירות לקוחות', 'ניהול פיננסי'],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 } },
  alternates: {
    canonical: '/contact',
    languages: {
      'he-IL': '/contact',
      'x-default': '/contact',
    },
  },
  openGraph: {
    title: `צור קשר | ${branding.name}`,
    description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
    url: '/contact',
    siteName: branding.name,
    type: 'website',
    locale: 'he_IL',
    images: [{ url: '/logo.png', width: 2816, height: 1536, alt: `${branding.name} - צור קשר` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `צור קשר | ${branding.name}`,
    description: `צרו קשר עם צוות ${branding.name}. נשמח לעזור.`,
    images: ['/logo.png'],
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: `צור קשר | ${branding.name}`,
    description: `צרו קשר עם צוות ${branding.name}. נשמח לענות על שאלות, לקבל משוב ולעזור בכל נושא.`,
    url: 'https://aglamazo.com/contact',
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
      <section dir="rtl" style={{ maxWidth: '600px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#1e293b' }}>דרכי יצירת קשר</h2>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          צוות {branding.name} זמין לכל שאלה, הצעה או בעיה טכנית.
          ניתן לשלוח הודעה דרך הטופס למעלה או לכתוב ישירות ל-<a href="mailto:support@aglamaz.com" style={{ color: '#4338ca' }}>support@aglamaz.com</a>.
          אנו משתדלים להשיב תוך יום עסקים אחד.
        </p>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          {branding.name} הוא כלי לניהול פיננסי חכם לעסקים קטנים ובינוניים בישראל.
          המערכת כוללת תזרים מזומנים, ניהול תקציב, ייבוא קבצי בנק ואשראי ותחזית תשלומים — הכל בפרטיות מלאה, ללא שרתים חיצוניים.
        </p>
      </section>
      <nav dir="rtl" style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#1e293b' }}>עמודים נוספים</h3>
        <ul style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          <li><Link href="/about" style={{ color: '#4338ca' }}>אודות</Link></li>
          <li><Link href="/guide" style={{ color: '#4338ca' }}>מדריך שימוש</Link></li>
          <li><Link href="/pricing" style={{ color: '#4338ca' }}>מחירים</Link></li>
          <li><Link href="/demo-form" style={{ color: '#4338ca' }}>טופס הדגמה</Link></li>
          <li><Link href="/terms" style={{ color: '#4338ca' }}>תנאי שימוש</Link></li>
        </ul>
      </nav>
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
