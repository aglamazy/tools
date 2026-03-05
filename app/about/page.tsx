import type { Metadata } from 'next'
import Link from 'next/link'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `אודות | ${branding.name}`,
  description: `${branding.name} - ${branding.tagline}. ניהול פיננסי, תובנות חכמות ועוד.`,
  openGraph: {
    title: `אודות | ${branding.name}`,
    description: `${branding.name} - ${branding.tagline}. ניהול פיננסי, תובנות חכמות ועוד.`,
  },
}

export default function AboutPage() {
  return (
    <main className="app" dir="rtl">
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{branding.name}</h1>
          <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
            {branding.tagline}
          </p>
        </header>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>מה זה?</h2>
          <p style={{ lineHeight: '1.75', marginBottom: '1rem' }}>
            {branding.name} הוא העוזר החכם שלך לניהול העסק - מנתח את הכספים, מציג תובנות ועוזר לך לקבל החלטות.
            האפליקציה מאפשרת לך לייבא קבצי בנק וכרטיסי אשראי, לנתח תזרים מזומנים, לעקוב אחרי תקציב ולתכנן תשלומים עתידיים.
          </p>
          <p style={{ lineHeight: '1.75' }}>
            בניגוד לכלים אחרים, כל המידע שלך נשמר <strong>בדפדפן שלך בלבד</strong> - ללא שרתים חיצוניים,
            ללא העלאה לענן, וללא שיתוף מידע עם צדדים שלישיים.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>תכונות עיקריות</h2>
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', borderRight: '4px solid #3b82f6' }}>
              <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📥</span>
                <span>ייבוא קבצים</span>
              </h3>
              <p style={{ margin: 0, color: '#475569' }}>
                ייבא קבצי בנק (FIBI) וכרטיסי אשראי בקלות. הקבצים נשמרים באופן מקומי ומאפשרים ניתוח מפורט של כל העסקאות.
              </p>
            </div>

            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', borderRight: '4px solid #10b981' }}>
              <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>💰</span>
                <span>תזרים מזומנים</span>
              </h3>
              <p style={{ margin: 0, color: '#475569' }}>
                עקוב אחרי תנועת הכסף בחשבון הבנק שלך - ראה מתי כסף נכנס ויוצא, כולל חיובי כרטיסי אשראי.
                התצוגה מציגה את התזרים בפועל לפי תאריכי חיוב.
              </p>
            </div>

            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', borderRight: '4px solid #f59e0b' }}>
              <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📊</span>
                <span>ניהול תקציב</span>
              </h3>
              <p style={{ margin: 0, color: '#475569' }}>
                סווג עסקאות לפי נושאים (קטגוריות), סמן הוצאות קבועות ומשתנות, וראה את התקציב שלך מול הביצוע בפועל.
                התצוגה מציגה את ההוצאות לפי תאריכי העסקה.
              </p>
            </div>

            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', borderRight: '4px solid #8b5cf6', opacity: 0.6 }}>
              <h3 style={{ fontSize: '1.125rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>💳</span>
                <span>תחזית תשלומים</span>
                <span style={{ fontSize: '0.75rem', background: '#8b5cf6', color: 'white', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>
                  בקרוב
                </span>
              </h3>
              <p style={{ margin: 0, color: '#475569' }}>
                תכנן את העתיד - ראה תחזית של תשלומים עתידיים, כולל תשלומים בתשלומים והוצאות קבועות חודשיות.
              </p>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>פרטיות ואבטחה</h2>
          <div style={{ background: '#ecfdf5', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #10b981' }}>
            <ul style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75' }}>
              <li><strong>כל המידע נשמר בדפדפן שלך בלבד</strong> - אין שרתים חיצוניים</li>
              <li><strong>ללא העלאה לענן</strong> - הקבצים והנתונים נשארים אצלך</li>
              <li><strong>ללא צדדים שלישיים</strong> - אף אחד לא רואה את המידע שלך</li>
              <li><strong>האחריות על גיבוי היא שלך</strong> - ניתן לייצא את כל הנתונים בכל עת</li>
              <li><strong>ללא סנכרון בין מכשירים</strong> - כל מכשיר שומר נתונים נפרדים</li>
            </ul>
          </div>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>איך זה עובד?</h2>
          <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75' }}>
            <li><strong>ייבא קבצים</strong> - הורד קבצי תנועות מהבנק וכרטיסי האשראי שלך וייבא אותם לאפליקציה</li>
            <li><strong>נתח תזרים</strong> - ראה מתי כסף נכנס ויוצא מהחשבון שלך</li>
            <li><strong>נהל תקציב</strong> - סווג את ההוצאות שלך ועקוב אחרי התקציב החודשי</li>
            <li><strong>תכנן את העתיד</strong> - (בקרוב) ראה תחזית של תשלומים עתידיים</li>
          </ol>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>למי זה מתאים?</h2>
          <p style={{ lineHeight: '1.75', marginBottom: '1rem' }}>
            הכלי מתאים לכל מי שרוצה:
          </p>
          <ul style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75' }}>
            <li>לעקוב אחרי תזרים מזומנים חודשי</li>
            <li>לנהל תקציב אישי או משפחתי</li>
            <li>להבין לאן הולך הכסף</li>
            <li>לתכנן תשלומים עתידיים</li>
            <li>לשמור על פרטיות מלאה של המידע הפיננסי</li>
          </ul>
        </section>

        <section style={{ textAlign: 'center', padding: '2rem 0', borderTop: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>מוכנים להתחיל?</h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/tools/import"
              className="file-picker"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              התחל עכשיו
            </Link>
            <Link
              href="/guide"
              className="file-picker"
              style={{ textDecoration: 'none', display: 'inline-block', background: '#64748b' }}
            >
              מדריך שימוש
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
