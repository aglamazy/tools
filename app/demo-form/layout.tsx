import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

const PAGE_DATE_MODIFIED = '2026-04-28'
const PAGE_DATE_PUBLISHED = '2026-03-29'

export const metadata: Metadata = {
  title: `טופס הדגמה | ${branding.name}`,
  description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי. גלו כיצד המערכת עוזרת לנהל את העסק שלכם.`,
  keywords: ['טופס הדגמה', 'דמו Aglamazo', 'טופס הרשמה אינטראקטיבי', 'מילוי טפסים אוטומטי', 'דוגמה לטופס', 'אקדמיה למוזיקה'],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 } },
  alternates: {
    canonical: '/demo-form',
    languages: {
      'he-IL': '/demo-form',
      'x-default': '/demo-form',
    },
  },
  openGraph: {
    title: `טופס הדגמה | ${branding.name}`,
    description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי. גלו כיצד המערכת עוזרת לנהל את העסק שלכם.`,
    url: '/demo-form',
    siteName: branding.name,
    type: 'website',
    locale: 'he_IL',
    images: [{ url: '/logo.png', width: 2816, height: 1536, alt: `${branding.name} - טופס הדגמה` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `טופס הדגמה | ${branding.name}`,
    description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי.`,
    images: ['/logo.png'],
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `טופס הדגמה | ${branding.name}`,
    description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי.`,
    url: 'https://aglamazo.com/demo-form',
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
      { '@type': 'ListItem', position: 2, name: 'טופס הדגמה', item: 'https://aglamazo.com/demo-form' },
    ],
  },
]

export default function DemoFormLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
      <section dir="rtl" style={{ maxWidth: '700px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#1e293b' }}>על טופס ההדגמה</h2>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          טופס ההדגמה של {branding.name} מאפשר לנסות את כלי מילוי הטפסים האוטומטי שלנו.
          הטופס כולל שלבים מרובים — פרטים אישיים, רקע מקצועי והעלאת מסמכים — בדיוק כמו טפסי הרשמה אמיתיים.
        </p>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          בעזרת {branding.name}, ניתן למלא טפסים מקוונים בלחיצה אחת.
          המערכת שומרת את הנתונים שלכם בדפדפן ומאפשרת למלא טפסים חוזרים ללא הקלדה מחדש.
          מתאים לבעלי עסקים שממלאים טפסים רבים — הרשמות, בקשות, דוחות ועוד.
        </p>
      </section>
      <nav dir="rtl" style={{ maxWidth: '700px', margin: '0 auto', padding: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#1e293b' }}>עמודים נוספים</h3>
        <ul style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          <li><Link href="/about" style={{ color: '#4338ca' }}>אודות</Link></li>
          <li><Link href="/guide" style={{ color: '#4338ca' }}>מדריך שימוש</Link></li>
          <li><Link href="/pricing" style={{ color: '#4338ca' }}>מחירים</Link></li>
          <li><Link href="/contact" style={{ color: '#4338ca' }}>צור קשר</Link></li>
          <li><Link href="/terms" style={{ color: '#4338ca' }}>תנאי שימוש</Link></li>
        </ul>
      </nav>
      <noscript>
        <div dir="rtl" style={{ maxWidth: '700px', margin: '2rem auto', padding: '2rem' }}>
          <h1>טופס הדגמה | {branding.name}</h1>
          <p>נסו את {branding.name} עם טופס הדגמה אינטראקטיבי. גלו כיצד המערכת עוזרת לנהל טפסים ומסמכים בקלות.</p>
          <p>הטופס דורש JavaScript כדי לפעול. אנא הפעילו JavaScript בדפדפן שלכם.</p>
        </div>
      </noscript>
    </>
  )
}
