import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

const PAGE_DATE_MODIFIED = '2026-04-27'
const PAGE_DATE_PUBLISHED = '2026-03-29'

export const metadata: Metadata = {
  title: `מדריך שימוש | ${branding.name}`,
  description: `מדריך מפורט לשימוש ב-${branding.name} - ייבוא קבצים, ניתוח תזרים, ניהול תקציב ותחזית תשלומים. למד כיצד לנהל את הכספים שלך בצורה חכמה.`,
  keywords: ['מדריך Aglamazo', 'איך לייבא קבצי בנק', 'איך לנהל תקציב', 'ניתוח תזרים מזומנים', 'תחזית תשלומים', 'מדריך ניהול פיננסי'],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 } },
  alternates: {
    canonical: '/guide',
  },
  openGraph: {
    title: `מדריך שימוש | ${branding.name}`,
    description: `מדריך מפורט לשימוש ב-${branding.name} - ייבוא קבצים, ניתוח תזרים, ניהול תקציב ותחזית תשלומים.`,
    url: '/guide',
    siteName: branding.name,
    type: 'article',
    locale: 'he_IL',
    images: [{ url: '/logo.png', width: 2816, height: 1536, alt: `${branding.name} - מדריך שימוש` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `מדריך שימוש | ${branding.name}`,
    description: `מדריך מפורט לייבוא, ניתוח, תקציב ותחזית.`,
    images: ['/logo.png'],
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `מדריך שימוש | ${branding.name}`,
    description: `מדריך מפורט לשימוש ב-${branding.name} - ייבוא קבצים, ניתוח תזרים, ניהול תקציב ותחזית תשלומים.`,
    url: 'https://aglamazo.com/guide',
    inLanguage: 'he-IL',
    datePublished: PAGE_DATE_PUBLISHED,
    dateModified: PAGE_DATE_MODIFIED,
    isPartOf: { '@type': 'WebSite', name: branding.name, url: 'https://aglamazo.com/' },
    primaryImageOfPage: { '@type': 'ImageObject', url: 'https://aglamazo.com/logo.png' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `מדריך שימוש ב-${branding.name}`,
    description: 'מדריך מפורט לניהול פיננסי עם Aglamazo - ייבוא קבצי בנק, ניתוח תזרים, וניהול תקציב.',
    inLanguage: 'he-IL',
    totalTime: 'PT15M',
    step: [
      { '@type': 'HowToStep', position: 1, name: 'ייבוא קבצי בנק ואשראי', text: 'הורד את קובץ התנועות מאתר הבנק או חברת האשראי וייבא אותו לאפליקציה.' },
      { '@type': 'HowToStep', position: 2, name: 'ניתוח תזרים מזומנים', text: 'צפה בתנועות הכסף לפי חודש, ראה הכנסות והוצאות וזהה דפוסים.' },
      { '@type': 'HowToStep', position: 3, name: 'ניהול תקציב', text: 'סווג עסקאות לקטגוריות והגדר תקציב חודשי לכל קטגוריה.' },
      { '@type': 'HowToStep', position: 4, name: 'תחזית תשלומים', text: 'הגדר תשלומים קבועים וצפה בתחזית של החודשים הקרובים.' },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: branding.name, item: 'https://aglamazo.com/' },
      { '@type': 'ListItem', position: 2, name: 'מדריך שימוש', item: 'https://aglamazo.com/guide' },
    ],
  },
]

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
      <section dir="rtl" style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#1e293b' }}>ניהול פיננסי חכם עם {branding.name}</h2>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          {branding.name} מאפשר לך לנהל את הכספים של העסק בצורה פשוטה וחכמה.
          ייבא קבצי תנועות מכל הבנקים הגדולים בישראל — בנק הפועלים, בנק לאומי, דיסקונט ועוד —
          וכרטיסי אשראי כמו ישראכרט, מקס ולאומי קארד.
          המערכת מנתחת את התזרים החודשי ומציגה תמונה ברורה של המצב הפיננסי שלך.
        </p>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          כל המידע נשמר בדפדפן שלך בלבד — ללא שרתים חיצוניים וללא חשש להדלפת מידע פיננסי רגיש.
          ניתן לגבות את הנתונים בכל עת ולשחזר אותם במכשיר אחר.
        </p>
      </section>
      <nav dir="rtl" style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#1e293b' }}>עמודים נוספים</h3>
        <ul style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          <li><Link href="/about" style={{ color: '#4338ca' }}>אודות</Link></li>
          <li><Link href="/pricing" style={{ color: '#4338ca' }}>מחירים</Link></li>
          <li><Link href="/demo-form" style={{ color: '#4338ca' }}>טופס הדגמה</Link></li>
          <li><Link href="/form-filler" style={{ color: '#4338ca' }}>מילוי טפסים</Link></li>
          <li><Link href="/contact" style={{ color: '#4338ca' }}>צור קשר</Link></li>
          <li><Link href="/terms" style={{ color: '#4338ca' }}>תנאי שימוש</Link></li>
        </ul>
      </nav>
      <noscript>
        <div dir="rtl" style={{ maxWidth: '900px', margin: '2rem auto', padding: '2rem' }}>
          <h1>מדריך שימוש | {branding.name}</h1>
          <p>מדריך מפורט לשימוש ב-{branding.name} — ייבוא קבצי בנק ואשראי, ניתוח תזרים מזומנים, ניהול תקציב ותחזית תשלומים.</p>
          <ol>
            <li>הורד קבצי תנועות מהבנק וכרטיסי האשראי</li>
            <li>ייבא את הקבצים לאפליקציה</li>
            <li>נתח את התזרים החודשי</li>
            <li>סווג את ההוצאות לפי קטגוריות</li>
            <li>הגדר קטגוריות מותאמות אישית</li>
          </ol>
        </div>
      </noscript>
    </>
  )
}
