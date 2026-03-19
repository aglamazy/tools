import type { Metadata } from 'next'
import Link from 'next/link'
import { branding, routes } from '@/app/config'

export const metadata: Metadata = {
  title: `${branding.name} - ${branding.tagline}`,
  description: `${branding.name} - ניהול פיננסי חכם לעסק שלך. תזרים מזומנים, תקציב, תחזית תשלומים ועוד - הכל בפרטיות מלאה.`,
}

export default function LandingPage() {
  return (
    <div className="landing" dir="rtl">
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
