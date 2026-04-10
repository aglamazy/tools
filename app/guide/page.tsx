import type { Metadata } from 'next'
import Link from 'next/link'
import { branding, routes } from '@/app/config'

export const metadata: Metadata = {
  title: `מדריך שימוש | ${branding.name}`,
  description: `מדריך מפורט לשימוש ב-${branding.name} - ייבוא קבצים, ניתוח תזרים, ניהול תקציב ותחזית תשלומים.`,
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/guide',
  },
  openGraph: {
    title: `מדריך שימוש | ${branding.name}`,
    description: `מדריך מפורט לשימוש ב-${branding.name} - ייבוא קבצים, ניתוח תזרים, ניהול תקציב ותחזית תשלומים.`,
    url: '/guide',
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `מדריך שימוש | ${branding.name}`,
    description: `מדריך מפורט לשימוש ב-${branding.name} - ייבוא קבצים, ניתוח תזרים, ניהול תקציב ותחזית תשלומים.`,
    url: 'https://aglamazo.com/guide',
    inLanguage: 'he',
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

export default function GuidePage() {
  return (
    <main className="app" dir="rtl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>מדריך שימוש</h1>
          <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
            למד כיצד להשתמש ב-{branding.name} בצורה מיטבית
          </p>
        </header>

        {/* Quick Start */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1e293b' }}>התחלה מהירה</h2>
          <div style={{ background: '#f1f5f9', padding: '1.5rem', borderRadius: '0.5rem' }}>
            <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75' }}>
              <li>הורד קבצי תנועות מהבנק וכרטיסי האשראי שלך</li>
              <li>ייבא את הקבצים לאפליקציה דרך עמוד "ייבוא קבצים"</li>
              <li>נתח את התזרים החודשי בעמוד "תזרים מזומנים"</li>
              <li>סווג את ההוצאות שלך בעמוד "תקציב"</li>
              <li>הגדר קטגוריות מותאמות אישית בעמוד "הגדרות"</li>
            </ol>
          </div>
        </section>

        {/* Step 1: Import */}
        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{
              background: '#3b82f6',
              color: 'white',
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              flexShrink: 0,
            }}>
              1
            </div>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>ייבוא קבצים</h2>
          </div>

          <div style={{ paddingRight: '3.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>איך מורידים קבצי תנועות?</h3>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>מבנק פועלים (FIBI):</h4>
              <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75' }}>
                <li>היכנס לאתר הבנק שלך</li>
                <li>עבור לחשבון העו"ש שלך</li>
                <li>בחר "יצוא לאקסל" או "הורדת תנועות"</li>
                <li>בחר טווח תאריכים (מומלץ: חודש אחד)</li>
                <li>שמור את הקובץ במחשב שלך</li>
              </ol>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>מכרטיס אשראי:</h4>
              <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75' }}>
                <li>היכנס לאתר חברת כרטיסי האשראי (ישראכרט, מקס, לאומי קארד וכו')</li>
                <li>עבור לכרטיס שלך</li>
                <li>בחר "יצוא עסקאות" או "הורדה לאקסל"</li>
                <li>בחר טווח תאריכים (מומלץ: מספר חודשים כדי לכלול תשלומים)</li>
                <li>שמור את הקובץ</li>
              </ol>
            </div>

            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem', marginTop: '1.5rem' }}>איך מייבאים?</h3>
            <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75', marginBottom: '1rem' }}>
              <li>עבור לעמוד <Link href={routes.import} style={{ color: '#3b82f6', textDecoration: 'none' }}>ייבוא קבצים</Link></li>
              <li>לחץ על "ייבא קובץ חדש"</li>
              <li>בחר תיקייה (מומלץ: תיקייה קבועה לכל קבצי הבנק שלך)</li>
              <li>בחר את הקובץ לייבוא</li>
              <li>המערכת תזהה אוטומטית את סוג הקובץ (בנק או כרטיס אשראי)</li>
              <li>הקובץ יישמר והמידע יעובד</li>
            </ol>

            <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '0.5rem', borderRight: '4px solid #f59e0b' }}>
              <strong>💡 טיפ:</strong> שמור את כל קבצי הבנק באותה תיקייה. זה יאפשר לך לנווט מהר יותר בפעם הבאה.
            </div>
          </div>
        </section>

        {/* Step 2: Cash Flow */}
        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{
              background: '#10b981',
              color: 'white',
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              flexShrink: 0,
            }}>
              2
            </div>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>ניתוח תזרים מזומנים</h2>
          </div>

          <div style={{ paddingRight: '3.5rem' }}>
            <p style={{ lineHeight: '1.75', marginBottom: '1rem' }}>
              עמוד התזרים מציג לך <strong>מתי כסף בפועל נכנס ויצא מהחשבון</strong> שלך.
            </p>

            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>מה תראה בעמוד?</h3>
            <ul style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75', marginBottom: '1rem' }}>
              <li><strong>תנועות בנק</strong> - כל הכסף שנכנס ויצא בחשבון העו"ש</li>
              <li><strong>חיובי כרטיסי אשראי</strong> - חיובים שטרם שולמו (לפי תאריך חיוב)</li>
              <li><strong>סיכום</strong> - הכנסות, הוצאות ומאזן נטו לחודש</li>
            </ul>

            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>איך משתמשים?</h3>
            <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75', marginBottom: '1rem' }}>
              <li>עבור לעמוד <Link href={routes.cashFlow} style={{ color: '#3b82f6', textDecoration: 'none' }}>תזרים מזומנים</Link></li>
              <li>בחר חודש מהרשימה הנפתחת</li>
              <li>עיין בטבלת התנועות מהבנק</li>
              <li>בדוק את חיובי כרטיסי האשראי הצפויים</li>
              <li>ראה את הסיכום - האם יצאת בפלוס או במינוס?</li>
            </ol>

            <div style={{ background: '#dbeafe', padding: '1rem', borderRadius: '0.5rem', borderRight: '4px solid #3b82f6' }}>
              <strong>ℹ️ חשוב לדעת:</strong> המערכת מזהה אוטומטית חיובי כרטיס אשראי שכבר שולמו ומסתירה אותם
              כדי למנוע כפילויות. אם חיוב הכרטיס כבר מופיע בתנועות הבנק, הוא לא יופיע שוב בטבלת החיובים.
            </div>
          </div>
        </section>

        {/* Step 3: Budget */}
        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{
              background: '#f59e0b',
              color: 'white',
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              flexShrink: 0,
            }}>
              3
            </div>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>ניהול תקציב</h2>
          </div>

          <div style={{ paddingRight: '3.5rem' }}>
            <p style={{ lineHeight: '1.75', marginBottom: '1rem' }}>
              עמוד התקציב מציג <strong>מתי ביצעת רכישות</strong> (לא מתי שילמת עליהן).
            </p>

            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>מה תראה בעמוד?</h3>
            <ul style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75', marginBottom: '1rem' }}>
              <li><strong>כל העסקאות</strong> - מהבנק וכרטיסי האשראי לפי תאריך הרכישה</li>
              <li><strong>סיווג לקטגוריות</strong> - אפשרות לסווג כל עסקה לנושא (סופרמרקט, דלק, בילויים וכו')</li>
              <li><strong>הוצאות קבועות/משתנות</strong> - סימון עסקאות כקבועות (ארנונה, חשמל) או משתנות</li>
              <li><strong>פירוט תשלומים</strong> - מידע על תשלומים (3/12 וכו')</li>
              <li><strong>סיכום</strong> - הכנסות, הוצאות ומאזן</li>
            </ul>

            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>איך משתמשים?</h3>
            <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75', marginBottom: '1rem' }}>
              <li>עבור לעמוד <Link href={routes.budget} style={{ color: '#3b82f6', textDecoration: 'none' }}>תקציב</Link></li>
              <li>בחר חודש לניתוח</li>
              <li>עבור על העסקאות וסווג אותן לפי נושאים (בחר מהרשימה הנפתחת)</li>
              <li>סמן הוצאות קבועות (ארנונה, משכנתא, מים) עם ה-checkbox</li>
              <li>ראה את החלוקה לפי קטגוריות בסיכום</li>
            </ol>

            <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '0.5rem', borderRight: '4px solid #f59e0b' }}>
              <strong>💡 טיפ:</strong> אותה קטגוריה יכולה להכיל גם הוצאות קבועות וגם משתנות.
              לדוגמה: "חשמל" יכול להיות הוצאה קבועה, אבל "סופרמרקט" משתנה מחודש לחודש.
            </div>
          </div>
        </section>

        {/* Step 4: Settings */}
        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{
              background: '#64748b',
              color: 'white',
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              flexShrink: 0,
            }}>
              4
            </div>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>הגדרות וקטגוריות</h2>
          </div>

          <div style={{ paddingRight: '3.5rem' }}>
            <p style={{ lineHeight: '1.75', marginBottom: '1rem' }}>
              בעמוד ההגדרות תוכל להתאים אישית את הקטגוריות (נושאים) לפי הצרכים שלך.
            </p>

            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>איך מגדירים קטגוריות?</h3>
            <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75', marginBottom: '1rem' }}>
              <li>עבור לעמוד <Link href={routes.settings} style={{ color: '#3b82f6', textDecoration: 'none' }}>הגדרות</Link></li>
              <li>לחץ על "הוסף נושא חדש"</li>
              <li>בחר שם לקטגוריה (למשל: "סופרמרקט", "דלק", "בילויים")</li>
              <li>בחר סוג (הכנסה או הוצאה)</li>
              <li>הקטגוריה תופיע מיד ברשימה הנפתחת בעמוד התקציב</li>
            </ol>

            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem', marginTop: '1.5rem' }}>גיבוי ושחזור נתונים</h3>
            <p style={{ lineHeight: '1.75', marginBottom: '1rem' }}>
              כל המידע שלך נשמר בדפדפן שלך בלבד. כדי לגבות את הנתונים:
            </p>
            <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75', marginBottom: '1rem' }}>
              <li>עבור לעמוד הגדרות</li>
              <li>גלול למטה לאזור "גיבוי ושחזור"</li>
              <li>לחץ על "ייצא נתונים" כדי לשמור גיבוי</li>
              <li>שמור את הקובץ במקום בטוח (Google Drive, Dropbox וכו')</li>
              <li>לשחזור: לחץ על "ייבא נתונים" ובחר את קובץ הגיבוי</li>
            </ol>

            <div style={{ background: '#fee2e2', padding: '1rem', borderRadius: '0.5rem', borderRight: '4px solid #ef4444' }}>
              <strong>⚠️ חשוב:</strong> האפליקציה לא שומרת את המידע שלך בשרת. אם תמחק את המטמון של הדפדפן
              או תעבור למכשיר אחר, תאבד את הנתונים. הקפד לגבות את המידע באופן קבוע!
            </div>
          </div>
        </section>

        {/* Privacy & Data */}
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>פרטיות ואבטחת מידע</h2>
          <div style={{ background: '#ecfdf5', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #10b981' }}>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>איך המידע שלך מוגן?</h3>
            <ul style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75' }}>
              <li><strong>אחסון מקומי בלבד</strong> - כל המידע נשמר ב-localStorage של הדפדפן שלך</li>
              <li><strong>ללא שרתים</strong> - הקבצים לא מועלים לשום שרת חיצוני</li>
              <li><strong>ללא מעקב</strong> - האפליקציה לא שולחת מידע אישי לשום מקום</li>
              <li><strong>עבודה מקומית</strong> - כל העיבוד מתבצע על המחשב שלך</li>
              <li><strong>בשליטתך המלאה</strong> - אתה יכול למחוק את כל המידע בכל עת</li>
            </ul>
          </div>
        </section>

        {/* Tips & Best Practices */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>טיפים לשימוש מיטבי</h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
              <strong>📅 ייבא באופן קבוע</strong> - הורד קבצים מהבנק פעם בחודש כדי לעקוב אחרי התזרים
            </div>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
              <strong>🏷️ סווג מיד</strong> - סווג עסקאות לקטגוריות ברגע שאתה מייבא קובץ חדש
            </div>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
              <strong>💾 גבה באופן קבוע</strong> - ייצא את הנתונים פעם בחודש לגיבוי חיצוני
            </div>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
              <strong>📊 השווה חודשים</strong> - השתמש בנתונים ההיסטוריים כדי לראות מגמות
            </div>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem' }}>
              <strong>🔍 בדוק חריגות</strong> - שים לב לעסקאות יוצאות דופן או לא צפויות
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section style={{ textAlign: 'center', padding: '2rem 0', borderTop: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>מוכנים להתחיל?</h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href={routes.import}
              className="file-picker"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              ייבא קובץ ראשון
            </Link>
            <Link
              href={routes.about}
              className="file-picker"
              style={{ textDecoration: 'none', display: 'inline-block', background: '#64748b' }}
            >
              חזרה לאודות
            </Link>
          </div>
        </section>

        <nav style={{ padding: '1rem 0' }}>
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
      </div>
    </main>
  )
}
