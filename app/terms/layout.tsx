import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `תנאי שימוש | ${branding.name}`,
  description: `תנאי השימוש של ${branding.name}. קראו את התנאים וההגבלות לפני השימוש בשירות.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: `תנאי שימוש | ${branding.name}`,
    description: `תנאי השימוש של ${branding.name}. קראו את התנאים וההגבלות לפני השימוש בשירות.`,
    url: '/terms',
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `תנאי שימוש | ${branding.name}`,
    description: `תנאי השימוש של ${branding.name}. קראו את התנאים וההגבלות לפני השימוש בשירות.`,
    url: 'https://aglamazo.com/terms',
    inLanguage: 'he',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: branding.name, item: 'https://aglamazo.com/' },
      { '@type': 'ListItem', position: 2, name: 'תנאי שימוש', item: 'https://aglamazo.com/terms' },
    ],
  },
]

export default function TermsLayout({ children }: { children: React.ReactNode }) {
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
          <li><Link href="/demo-form" style={{ color: '#4338ca' }}>טופס הדגמה</Link></li>
          <li><Link href="/form-filler" style={{ color: '#4338ca' }}>מילוי טפסים</Link></li>
          <li><Link href="/contact" style={{ color: '#4338ca' }}>צור קשר</Link></li>
        </ul>
      </nav>
      <noscript>
        <div dir="rtl" style={{ maxWidth: '700px', margin: '2rem auto', padding: '2rem' }}>
          <h1>תנאי שימוש | {branding.name}</h1>
          <p>
            {branding.name} הוא שירות לניהול פיננסי חכם.
            הנתונים נשמרים בדפדפן שלכם בלבד.
            קראו את התנאים המלאים לפני השימוש בשירות.
          </p>
        </div>
      </noscript>
    </>
  )
}
