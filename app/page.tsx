import type { Metadata } from 'next'
import Link from 'next/link'
import { branding, routes } from '@/app/config'
import { VARIANT, VARIANT_CONFIG } from '@/app/config/variants'
import ReturningUserRedirect from '@/app/components/ReturningUserRedirect'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aglamazo.com'

const description = VARIANT === 'saliko'
  ? `${VARIANT_CONFIG.name} — ${VARIANT_CONFIG.homeHero.subheadline}`
  : `${branding.name} - ניהול פיננסי חכם לעסק שלך. תזרים מזומנים, תקציב, תחזית תשלומים ועוד - הכל בפרטיות מלאה.`

export const metadata: Metadata = {
  title: `${branding.name} - ${branding.tagline}`,
  description,
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
      'מילוי טפסים',
      'צור קשר',
      'תנאי שימוש',
    ],
    url: [
      `${siteUrl}/about`,
      `${siteUrl}/guide`,
      `${siteUrl}/pricing`,
      `${siteUrl}/demo-form`,
      `${siteUrl}/form-filler`,
      `${siteUrl}/contact`,
      `${siteUrl}/terms`,
    ],
  },
]

export default function LandingPage() {
  if (VARIANT === 'saliko') return <SalikoHome />
  return <AglamazoHome />
}

function SalikoHome() {
  const { name, homeHero } = VARIANT_CONFIG
  return (
    <div className="landing" dir="rtl">
      <ReturningUserRedirect />
      <section className="landing-hero">
        <h1 className="landing-title">{name}</h1>
        <p className="landing-tagline">{homeHero.headline}</p>
        <p className="landing-subtitle">{homeHero.subheadline}</p>
        <div className="landing-cta">
          <Link href={routes.dashboard} className="landing-btn-primary">
            {homeHero.cta}
          </Link>
        </div>
      </section>

      <section className="landing-how-it-works">
        <h2>איך זה עובד?</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-number">1</div>
            <h3>חבר חנות</h3>
            <p>מחבר את החשבון שלך בשופרסל או רמי לוי. ההתחברות מוצפנת — הסיסמה שלך לעולם לא נשמרת בפלט.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">2</div>
            <h3>לימוד הרגלים</h3>
            <p>מספרים לסוכן מה אתה קונה כל שבוע. הוא לומד את ההעדפות שלך ובונה רשימה קבועה.</p>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">3</div>
            <h3>הוא קונה במקומך</h3>
            <p>פעם בשבוע, הסוכן פותח הזמנה אוטומטית. אתה מאשר בטלגרם — או פשוט מקבל את הסל.</p>
          </div>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-feature">
          <div className="landing-feature-icon">🤖</div>
          <h3>בלי הרעש של אתר הסופר</h3>
          <p>בלי באנרים, בלי הצעות מוקפצות, בלי לחפש מוצר 5 דקות. שיחה אחת בעברית — וזה נסגר.</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">🧠</div>
          <h3>חיפוש חכם יותר</h3>
          <p>"תוסיף תירס קפוא" מוצא את המוצר שאתה רוצה — לא 50 מוצרים שצריך לסנן ידנית.</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">💬</div>
          <h3>בטלגרם, מהמיטה</h3>
          <p>שינויים אחרונים? "תוריד עוף השבוע, תוסיף חלה" — והסוכן מסדר.</p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-icon">🔐</div>
          <h3>שלך זה שלך</h3>
          <p>פרטי החנויות מוצפנים. ההיסטוריה שייכת לך. אפשר למחוק הכל בכל רגע.</p>
        </div>
      </section>

      <section className="landing-register">
        <h2>חינם להתחיל</h2>
        <p>נסה את הסוכן עם החנות שלך. אם זה עובד לך — נדבר על תשלום קטן בעתיד.</p>
        <div className="landing-cta">
          <Link href={routes.dashboard} className="landing-btn-primary">
            {homeHero.cta}
          </Link>
        </div>
      </section>
    </div>
  )
}

function AglamazoHome() {
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
          הכל נשמר בדפדפן שלך, בפרטיות מלאה.
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
            <p>המידע נשמר בדפדפן. הורד גיבוי בכל עת כדי לשמור על הנתונים שלך.</p>
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
          <h3>פרטיות מלאה</h3>
          <p>כל המידע נשמר בדפדפן שלך בלבד. ללא שרתים, ללא ענן, ללא צדדים שלישיים.</p>
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
            <h3><Link href="/form-filler">מילוי טפסים</Link></h3>
            <p>כלי אוטומטי למילוי טפסים מקוונים — חסכו זמן בהרשמות.</p>
          </div>
          <div className="landing-step">
            <h3><Link href={routes.publicTerms}>תנאי שימוש</Link></h3>
            <p>קראו את התנאים וההגבלות לשימוש ב-{branding.name}.</p>
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
