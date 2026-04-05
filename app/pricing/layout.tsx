import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `מחירים | ${branding.name}`,
  description: `תוכניות ומחירים של ${branding.name}. בחרו את התוכנית המתאימה לעסק שלכם — חינם, בסיסי או פרימיום.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: `מחירים | ${branding.name}`,
    description: `תוכניות ומחירים של ${branding.name}. בחרו את התוכנית המתאימה לעסק שלכם — חינם, בסיסי או פרימיום.`,
    url: '/pricing',
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `מחירים | ${branding.name}`,
    description: `תוכניות ומחירים של ${branding.name}. בחרו את התוכנית המתאימה לעסק שלכם.`,
    url: 'https://aglamazo.com/pricing',
    inLanguage: 'he',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: branding.name, item: 'https://aglamazo.com/' },
      { '@type': 'ListItem', position: 2, name: 'מחירים', item: 'https://aglamazo.com/pricing' },
    ],
  },
]

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
      <noscript>
        <div dir="rtl" style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem' }}>
          <h1>תוכניות ומחירים | {branding.name}</h1>
          <p>בחרו את התוכנית המתאימה לעסק שלכם — חינם, בית, או מקצועי.</p>
          <ul>
            <li>חינם — ניהול תקציב בסיסי, ייבוא קבצי בנק, תזרים מזומנים</li>
            <li>בית — שיתוף עם בן/בת זוג, סנכרון בין מכשירים, גיבוי מוצפן</li>
            <li>מקצועי — ניהול עסקים מרובים, מעקב הון, תחזית תשלומים</li>
          </ul>
        </div>
      </noscript>
    </>
  )
}
