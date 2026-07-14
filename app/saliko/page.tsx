import type { Metadata } from 'next'
import Link from 'next/link'
import { routes } from '@/app/config'
import { VARIANT_CONFIG } from '@/app/config/variants'
import ReturningUserRedirect from '@/app/components/ReturningUserRedirect'

const SALIKO_URL = 'https://saliko.co.il'

export const metadata: Metadata = {
  title: `${VARIANT_CONFIG.name} — ${VARIANT_CONFIG.tagline}`,
  description: `${VARIANT_CONFIG.name} — ${VARIANT_CONFIG.homeHero.subheadline}`,
  alternates: {
    canonical: SALIKO_URL,
    languages: {
      'he-IL': SALIKO_URL,
      'x-default': SALIKO_URL,
    },
  },
}

// BreadcrumbList lets Google render a breadcrumb trail in results and
// strengthens the site-hierarchy signal for saliko.co.il (was missing —
// only Aglamazo pages carried breadcrumbs).
const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: VARIANT_CONFIG.name, item: `${SALIKO_URL}/` },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${VARIANT_CONFIG.name} — ${VARIANT_CONFIG.tagline}`,
    description: `${VARIANT_CONFIG.name} — ${VARIANT_CONFIG.homeHero.subheadline}`,
    url: `${SALIKO_URL}/`,
    inLanguage: 'he-IL',
    isPartOf: { '@type': 'WebSite', name: VARIANT_CONFIG.name, url: `${SALIKO_URL}/` },
  },
]

export default function SalikoLanding() {
  const { name, homeHero } = VARIANT_CONFIG
  return (
    <div className="landing" dir="rtl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
            <p>מחבר את החשבון שלך בשופרסל או מקור השפע. ההתחברות מוצפנת — הסיסמה שלך לעולם לא נשמרת בפלט.</p>
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
