import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

export const dynamic = 'force-static'

const PAGE_DATE_MODIFIED = '2026-04-28'
const PAGE_DATE_PUBLISHED = '2026-03-29'

export const metadata: Metadata = {
  title: `מחירים | ${branding.name}`,
  description: `תוכניות ומחירים של ${branding.name}. בחרו את התוכנית המתאימה לעסק שלכם — חינם, בסיסי או פרימיום.`,
  keywords: ['מחירים Aglamazo', 'תוכנית חינם', 'תוכנית פרימיום', 'מנוי חודשי', 'מחיר ניהול פיננסי', 'תוכנית עסקים'],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 } },
  alternates: {
    canonical: '/pricing',
    languages: {
      'he-IL': '/pricing',
      'x-default': '/pricing',
    },
  },
  openGraph: {
    title: `מחירים | ${branding.name}`,
    description: `תוכניות ומחירים של ${branding.name}. בחרו את התוכנית המתאימה לעסק שלכם — חינם, בסיסי או פרימיום.`,
    url: '/pricing',
    siteName: branding.name,
    type: 'website',
    locale: 'he_IL',
    images: [{ url: '/logo.png', width: 2816, height: 1536, alt: `${branding.name} - תוכניות ומחירים` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `מחירים | ${branding.name}`,
    description: `תוכנית חינמית, בית או מקצועי. בחרו את המתאים.`,
    images: ['/logo.png'],
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `מחירים | ${branding.name}`,
    description: `תוכניות ומחירים של ${branding.name}. בחרו את התוכנית המתאימה לעסק שלכם.`,
    url: 'https://aglamazo.com/pricing',
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
      { '@type': 'ListItem', position: 2, name: 'מחירים', item: 'https://aglamazo.com/pricing' },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `תוכניות ${branding.name}`,
    url: 'https://aglamazo.com/pricing',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        item: {
          '@type': 'SoftwareApplication',
          name: `${branding.name} חינם`,
          applicationCategory: 'FinanceApplication',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS', availability: 'https://schema.org/InStock' },
        },
      },
      {
        '@type': 'ListItem',
        position: 2,
        item: {
          '@type': 'SoftwareApplication',
          name: `${branding.name} מקצועי`,
          applicationCategory: 'FinanceApplication',
          offers: { '@type': 'Offer', price: '99', priceCurrency: 'ILS', availability: 'https://schema.org/InStock' },
        },
      },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'האם Aglamazo בחינם?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'כן, התוכנית הבסיסית של Aglamazo חינמית לחלוטין וכוללת תזרים מזומנים, ייבוא קבצי בנק, ניהול תקציב ומשימות — ללא הגבלת זמן.',
        },
      },
      {
        '@type': 'Question',
        name: 'האם הנתונים שלי בטוחים?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'כן. כל הנתונים נשמרים בדפדפן שלך בלבד, ללא שרתים חיצוניים. Aglamazo לא שולחת, מאחסנת או משתפת את הנתונים שלך עם אף גורם חיצוני.',
        },
      },
      {
        '@type': 'Question',
        name: 'מה מחיר התוכנית המקצועית?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'התוכנית המקצועית עולה 99 ש"ח לכל החיים במבצע השקה (מחיר מלא: 199 ש"ח). היא כוללת ניהול עסקים מרובים, מעקב הון, תחזית תשלומים וגיבוי מוצפן.',
        },
      },
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
      <section dir="rtl" style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#1e293b' }}>למה {branding.name}?</h2>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          {branding.name} מציע ניהול פיננסי מלא לעסקים קטנים ובינוניים בישראל.
          התוכנית החינמית כוללת תזרים מזומנים, ייבוא קבצי בנק וניהול תקציב — ללא הגבלת זמן.
          תוכנית הבית מאפשרת שיתוף עם בן/בת זוג וסנכרון בין מכשירים.
          התוכנית המקצועית מוסיפה ניהול עסקים מרובים, מעקב הון ותחזית תשלומים.
        </p>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          כל התוכניות כוללות פרטיות מלאה — הנתונים נשמרים בדפדפן שלכם בלבד.
          גיבוי מוצפן ל-Google Drive זמין בתוכניות הבית והמקצועית.
        </p>
      </section>
      <nav dir="rtl" style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#1e293b' }}>עמודים נוספים</h3>
        <ul style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          <li><Link href="/about" style={{ color: '#4338ca' }}>אודות</Link></li>
          <li><Link href="/guide" style={{ color: '#4338ca' }}>מדריך שימוש</Link></li>
          <li><Link href="/demo-form" style={{ color: '#4338ca' }}>טופס הדגמה</Link></li>
          <li><Link href="/contact" style={{ color: '#4338ca' }}>צור קשר</Link></li>
          <li><Link href="/terms" style={{ color: '#4338ca' }}>תנאי שימוש</Link></li>
        </ul>
      </nav>
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
