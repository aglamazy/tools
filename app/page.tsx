import type { Metadata } from 'next'
import Link from 'next/link'
import { branding, routes } from '@/app/config'
import ReturningUserRedirect from '@/app/components/ReturningUserRedirect'

export const dynamic = 'force-static'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aglamazo.com'

export const metadata: Metadata = {
  title: `${branding.name} - ${branding.tagline}`,
  description: `${branding.name} - ניהול פיננסי חכם לעסק שלך. תזרים מזומנים, תקציב, תחזית תשלומים ועוד - עם גיבוי ענן מוצפן בשליטתך ושיתוף מאובטח עם שותף לעסק.`,
  alternates: {
    canonical: '/',
    languages: {
      'he-IL': '/',
      'x-default': '/',
    },
  },
}

const homeJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'דף הבית',
        item: siteUrl,
      },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SiteNavigationElement',
    name: [
      'אודות',
      'מדריך שימוש',
      'מחירים',
      'טופס הדגמה',
      'צור קשר',
      'תנאי שימוש',
    ],
    url: [
      `${siteUrl}/about`,
      `${siteUrl}/guide`,
      `${siteUrl}/pricing`,
      `${siteUrl}/demo-form`,
      `${siteUrl}/contact`,
      `${siteUrl}/terms`,
    ],
  },
]

export default function LandingPage() {
  return (
    <div className="landing" dir="rtl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <ReturningUserRedirect />
      <section className="landing-hero">
        <h1 className="landing-title">{branding.name}</h1>
        <p className="landing-tagline">{branding.tagline}</p>
        <p className="landing-subtitle">
          ניהול פיננסי חכם - תזרים, תקציב ותובנות.
          <br />
          גיבוי ענן מוצפן שבשליטתך, ושיתוף עסק עם השותף - סיסמה נפרדת לעסק, בלי לחשוף את שאר החשבון.
        </p>
        <div className="landing-cta">
          <Link href={routes.dashboard} className="landing-btn-primary">
            התחל עכשיו - בחינם
          </Link>
        </div>
      </section>

      <section className="landing-how-it-works">
        <h2>איך זה עובד?</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-number">1</div>
            <h3>התחל מיד</h3>
            <p>לחץ והתחל להשתמש - ללא הרשמה, ללא תשלום. הכל עובד ישירות בדפדפן שלך.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">2</div>
            <h3>ייבא ונתח</h3>
            <p>ייבא קבצי בנק ואשראי, נתח תזרים מזומנים ונהל את התקציב שלך.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">3</div>
            <h3>גבה את הנתונים</h3>
            <p>הנתונים מגובים אוטומטית בענן מוצפן. הורד עותק מקומי בכל עת.</p>
          </div>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-feature">
          <div className="landing-feature-icon">&#x1F4E5;</div>
          <h3>ייבוא קבצים</h3>
          <p>ייבא קבצי בנק וכרטיסי אשראי בקלות. הקבצים נשמרים באופן מקומי בלבד.</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">&#x1F4B0;</div>
          <h3>תזרים מזומנים</h3>
          <p>עקוב אחרי תנועת הכסף - ראה מתי כסף נכנס ויוצא, כולל חיובי אשראי.</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">&#x1F4CA;</div>
          <h3>ניהול תקציב</h3>
          <p>סווג עסקאות לפי נושאים, סמן הוצאות קבועות ומשתנות, ועקוב אחרי הביצוע.</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">&#x1F512;</div>
          <h3>פרטיות בשליטתך</h3>
          <p>הנתונים שלך לבדך, בהצפנה שבשליטתך. אינטגרציית Google אופציונלית, רק להרשאות שאתה מאשר.</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">&#x1F91D;</div>
          <h3>שיתוף עסק עם שותף</h3>
          <p>כשיש שותף לעסק, ניתן לשתף איתו את העסק המשותף בסיסמה נפרדת. שאר הנתונים והעסקים שלך נשארים פרטיים.</p>
        </div>
      </section>

      <section className="landing-register">
        <h2>רוצה יותר?</h2>
        <p>הירשם בחינם כדי לסנכרן בין מכשירים, לגבות אוטומטית ולפתוח תכונות נוספות.</p>
        <div className="landing-cta">
          <Link href={routes.pricing} className="landing-btn-secondary">
            ראה מסלולים ומחירים
          </Link>
        </div>
      </section>

      <section className="landing-links">
        <h2>גלה עוד</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <h3><Link href={routes.about}>אודות</Link></h3>
            <p>למד עוד על {branding.name} והחזון שלנו.</p>
          </div>
          <div className="landing-step">
            <h3><Link href={routes.guide}>מדריך שימוש</Link></h3>
            <p>מדריך מפורט לשימוש במערכת — ייבוא, ניתוח ותקציב.</p>
          </div>
          <div className="landing-step">
            <h3><Link href="/demo-form">טופס הדגמה</Link></h3>
            <p>נסו את כלי מילוי הטפסים שלנו עם טופס דוגמה אינטראקטיבי.</p>
          </div>
          <div className="landing-step">
            <h3><Link href={routes.publicTerms}>תנאי שימוש</Link></h3>
            <p>קראו את התנאים וההגבלות לשימוש ב-{branding.name}.</p>
          </div>
        </div>
      </section>

      <section className="landing-links">
        <h2>מדריכים, תבניות ומחשבונים</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <h3><Link href="/madrich">מדריכים לבעל עסק</Link></h3>
            <p>קריאת דפי בנק, התאמת חשבון, תזרים מזומנים, מע"מ, הוצאות מוכרות וסיווג אוטומטי — מדריכים מעשיים חינם.</p>
          </div>
          <div className="landing-step">
            <h3><Link href="/template">תבניות אקסל חינם</Link></h3>
            <p>תבנית תזרים מזומנים וטבלת הוצאות והכנסות — להורדה ולשימוש מיידי, עם מעבר קל לסיווג אוטומטי.</p>
          </div>
          <div className="landing-step">
            <h3><Link href="/machshevon">מחשבונים לעצמאי</Link></h3>
            <p>מחשבוני מקדמות מס הכנסה ומע"מ — מבוססים על נתוני תזרים אמיתיים, לא על תחושת בטן.</p>
          </div>
        </div>
      </section>

      <section className="landing-contact">
        <h2>שאלה? בעיה? דברו איתנו</h2>
        <p>נשמח לעזור בכל נושא - שלחו הודעה ונחזור אליכם בהקדם</p>
        <div className="landing-cta">
          <Link href={routes.contact} className="landing-btn-secondary">
            שלח הודעה
          </Link>
        </div>
      </section>
    </div>
  )
}
