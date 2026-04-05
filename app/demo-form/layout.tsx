import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `טופס הדגמה | ${branding.name}`,
  description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי. גלו כיצד המערכת עוזרת לנהל את העסק שלכם.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/demo-form',
  },
  openGraph: {
    title: `טופס הדגמה | ${branding.name}`,
    description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי. גלו כיצד המערכת עוזרת לנהל את העסק שלכם.`,
    url: '/demo-form',
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `טופס הדגמה | ${branding.name}`,
    description: `נסו את ${branding.name} עם טופס הדגמה אינטראקטיבי.`,
    url: 'https://aglamazo.com/demo-form',
    inLanguage: 'he',
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
