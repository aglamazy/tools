import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

export const dynamic = 'force-static'

const PAGE_DATE_MODIFIED = '2026-04-28'
const PAGE_DATE_PUBLISHED = '2026-03-29'

export const metadata: Metadata = {
  title: `אודות | ${branding.name}`,
  description: `${branding.name} - ${branding.tagline}. ניהול פיננסי חכם לעסקים קטנים ובינוניים בישראל — תזרים מזומנים, תקציב, ייבוא קבצי בנק ואשראי, הכל בפרטיות מלאה.`,
  keywords: ['אודות Aglamazo', 'ניהול פיננסי', 'תזרים מזומנים', 'תקציב עסק קטן', 'ייבוא קבצי בנק', 'פרטיות פיננסית', 'IndexedDB', 'עסקים קטנים בישראל'],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 } },
  alternates: {
    canonical: '/about',
    languages: {
      'he-IL': '/about',
      'x-default': '/about',
    },
  },
  openGraph: {
    title: `אודות | ${branding.name}`,
    description: `${branding.name} - ${branding.tagline}. ניהול פיננסי חכם לעסקים קטנים ובינוניים בישראל.`,
    url: '/about',
    siteName: branding.name,
    type: 'website',
    locale: 'he_IL',
    images: [{ url: '/logo.png', width: 2816, height: 1536, alt: `${branding.name} - אודות` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `אודות | ${branding.name}`,
    description: `${branding.name} - ${branding.tagline}. ניהול פיננסי חכם לעסקים קטנים ובינוניים.`,
    images: ['/logo.png'],
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: `אודות | ${branding.name}`,
    description: `${branding.name} - ${branding.tagline}. ניהול פיננסי, תובנות חכמות ועוד.`,
    url: 'https://aglamazo.com/about',
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
      { '@type': 'ListItem', position: 2, name: 'אודות', item: 'https://aglamazo.com/about' },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `מה זה ${branding.name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${branding.name} הוא כלי לניהול פיננסי חכם לעסקים קטנים ובינוניים בישראל. הוא מאפשר ייבוא קבצי בנק וכרטיסי אשראי, ניתוח תזרים מזומנים, ניהול תקציב ותחזית תשלומים — הכל בפרטיות מלאה ללא שרתים חיצוניים.`,
        },
      },
      {
        '@type': 'Question',
        name: 'אילו בנקים נתמכים?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Aglamazo תומך בקבצי תנועות מכל הבנקים הגדולים בישראל: בנק הפועלים, בנק לאומי, בנק דיסקונט ועוד. כמו כן נתמכים כרטיסי אשראי כמו ישראכרט, מקס ולאומי קארד.',
        },
      },
      {
        '@type': 'Question',
        name: 'האם ניתן לסנכרן בין מכשירים?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'סנכרון בין מכשירים זמין בתוכניות הבית והמקצועית, הכוללות גיבוי מוצפן ל-Google Drive. בתוכנית החינמית, הנתונים נשמרים בדפדפן המקומי בלבד.',
        },
      },
    ],
  },
]

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
      <section dir="rtl" style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#1e293b' }}>למה לבחור ב-{branding.name}?</h2>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          {branding.name} פותח עבור עצמאים ובעלי עסקים קטנים ובינוניים בישראל שרוצים לנהל את הכספים שלהם בצורה חכמה ופשוטה.
          בניגוד לכלים המסורתיים, כל המידע נשמר בדפדפן שלך בלבד — ללא שרתים חיצוניים וללא חשש להדלפת מידע פיננסי רגיש.
        </p>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          האפליקציה מאפשרת לייבא קבצי תנועות מכל הבנקים הגדולים בישראל (בנק הפועלים, בנק לאומי, דיסקונט ועוד)
          וכרטיסי אשראי (ישראכרט, מקס, לאומי קארד וכדומה), לנתח את התזרים החודשי ולקבל תמונה ברורה של המצב הפיננסי.
        </p>
      </section>
      <nav dir="rtl" style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#1e293b' }}>עמודים נוספים</h3>
        <ul style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          <li><Link href="/guide" style={{ color: '#4338ca' }}>מדריך שימוש</Link></li>
          <li><Link href="/pricing" style={{ color: '#4338ca' }}>מחירים</Link></li>
          <li><Link href="/contact" style={{ color: '#4338ca' }}>צור קשר</Link></li>
          <li><Link href="/demo-form" style={{ color: '#4338ca' }}>טופס הדגמה</Link></li>
          <li><Link href="/terms" style={{ color: '#4338ca' }}>תנאי שימוש</Link></li>
        </ul>
      </nav>
      <noscript>
        <div dir="rtl" style={{ maxWidth: '800px', margin: '2rem auto', padding: '2rem' }}>
          <h1>אודות | {branding.name}</h1>
          <p>{branding.name} - {branding.tagline}. ניהול פיננסי חכם לעסקים קטנים ובינוניים בישראל.</p>
          <p>האפליקציה כוללת: תזרים מזומנים, ניהול תקציב, ייבוא קבצי בנק ואשראי, תחזית תשלומים — הכל בפרטיות מלאה.</p>
        </div>
      </noscript>
    </>
  )
}
