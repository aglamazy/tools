import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `אודות | ${branding.name}`,
  description: `${branding.name} - ${branding.tagline}. ניהול פיננסי חכם לעסקים קטנים ובינוניים בישראל — תזרים מזומנים, תקציב, ייבוא קבצי בנק ואשראי, הכל בפרטיות מלאה.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: `אודות | ${branding.name}`,
    description: `${branding.name} - ${branding.tagline}. ניהול פיננסי חכם לעסקים קטנים ובינוניים בישראל.`,
    url: '/about',
  },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
          <li><Link href="/form-filler" style={{ color: '#4338ca' }}>מילוי טפסים</Link></li>
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
