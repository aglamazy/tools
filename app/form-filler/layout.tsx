import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `מילוי טפסים | ${branding.name}`,
  description: `כלי מילוי טפסים אוטומטי של ${branding.name}. חסכו זמן במילוי טפסים מקוונים עבור העסק שלכם.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/form-filler',
  },
  openGraph: {
    title: `מילוי טפסים | ${branding.name}`,
    description: `כלי מילוי טפסים אוטומטי של ${branding.name}. חסכו זמן במילוי טפסים מקוונים עבור העסק שלכם.`,
    url: '/form-filler',
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `מילוי טפסים | ${branding.name}`,
    description: `כלי מילוי טפסים אוטומטי של ${branding.name}. חסכו זמן במילוי טפסים מקוונים.`,
    url: 'https://aglamazo.com/form-filler',
    inLanguage: 'he',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: branding.name, item: 'https://aglamazo.com/' },
      { '@type': 'ListItem', position: 2, name: 'מילוי טפסים', item: 'https://aglamazo.com/form-filler' },
    ],
  },
]

export default function FormFillerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
      <section dir="rtl" style={{ maxWidth: '700px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#1e293b' }}>מילוי טפסים אוטומטי</h2>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          כלי מילוי הטפסים של {branding.name} חוסך זמן יקר לבעלי עסקים.
          הזינו כתובת URL של טופס מקוון והמערכת תזהה את השדות ותמלא אותם אוטומטית עם הנתונים שלכם.
        </p>
        <p style={{ color: '#475569', lineHeight: 1.7 }}>
          הכלי תומך בטפסי הרשמה, בקשות רשמיות, דוחות ומסמכים מקוונים.
          כל הנתונים נשמרים בדפדפן שלכם בלבד — ללא שרתים חיצוניים, ללא צדדים שלישיים.
          מתאים במיוחד לעסקים קטנים ועצמאים שממלאים טפסים שונים באופן קבוע.
        </p>
      </section>
      <nav dir="rtl" style={{ maxWidth: '700px', margin: '0 auto', padding: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#1e293b' }}>עמודים נוספים</h3>
        <ul style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          <li><Link href="/about" style={{ color: '#4338ca' }}>אודות</Link></li>
          <li><Link href="/guide" style={{ color: '#4338ca' }}>מדריך שימוש</Link></li>
          <li><Link href="/pricing" style={{ color: '#4338ca' }}>מחירים</Link></li>
          <li><Link href="/demo-form" style={{ color: '#4338ca' }}>טופס הדגמה</Link></li>
          <li><Link href="/contact" style={{ color: '#4338ca' }}>צור קשר</Link></li>
          <li><Link href="/terms" style={{ color: '#4338ca' }}>תנאי שימוש</Link></li>
        </ul>
      </nav>
      <noscript>
        <div dir="rtl" style={{ maxWidth: '700px', margin: '2rem auto', padding: '2rem' }}>
          <h1>מילוי טפסים אוטומטי | {branding.name}</h1>
          <p>כלי מילוי טפסים אוטומטי של {branding.name}. חסכו זמן במילוי טפסים מקוונים עבור העסק שלכם.</p>
          <p>הכלי דורש JavaScript כדי לפעול. אנא הפעילו JavaScript בדפדפן שלכם.</p>
        </div>
      </noscript>
    </>
  )
}
