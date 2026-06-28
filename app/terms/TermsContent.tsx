export default function TermsContent() {
  return (
    <div>
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>1. כללי</h2>
        <p>
          ברוכים הבאים ל-Aglamazo. השימוש באפליקציה כפוף לתנאי שימוש אלה.
          בשימוש באפליקציה, אתה מסכים לתנאים המפורטים בעמוד זה.
          תנאים אלה חלים על כל משתמשי האפליקציה, לרבות משתמשים רשומים ומשתמשים שאינם רשומים.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>2. אחסון מידע</h2>
        <p>
          כל המידע הפיננסי שלך — כולל קבצי בנק, עסקאות, קטגוריות ותקציב — נשמר באופן מקומי בדפדפן שלך בלבד,
          תוך שימוש ב-IndexedDB (מסד נתונים מובנה בדפדפן).
          אנחנו לא מאחסנים מידע פיננסי בשרתים שלנו.
          האחריות על גיבוי הנתונים היא שלך; ניתן לייצא את הנתונים בכל עת דרך עמוד ההגדרות.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>3. פרטיות</h2>
        <p>
          אנו מחויבים לפרטיות שלך. האפליקציה לא משתפת מידע אישי או פיננסי עם צדדים שלישיים.
          קבצי הבנק והנתונים הפיננסיים שלך נשארים במכשיר שלך בלבד.
          המידע היחיד שנשמר בשרתינו הוא מידע חשבון (כתובת דוא"ל, סטטוס מנוי) לצרכי אימות וגישה לתכונות מתקדמות.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>4. שימוש</h2>
        <p>
          האפליקציה מיועדת לניהול פיננסי אישי ועסקי, כולל ניתוח תזרים מזומנים, ניהול תקציב, ייבוא קבצי בנק וכרטיסי אשראי.
          השימוש בכלי הניתוח, התקציב ותחזית התשלומים הוא באחריותך.
          אין לראות בתוצאות האפליקציה ייעוץ פיננסי מקצועי.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>5. סנכרון ענן</h2>
        <p>
          משתמשים רשומים יכולים לסנכרן נתונים בין מכשירים באמצעות Google Drive.
          הסנכרון מוצפן ומתבצע ישירות בין המכשיר שלך לחשבון Google Drive שלך.
          Aglamazo לא ניגשת לתוכן הגיבויים.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>6. תשלומים וסליקה</h2>
        <p>
          Aglamazo מציעה אפשרות לשליחת קישורי תשלום ללקוחות, באמצעות מעבד הסליקה YPAY.
          יש להיות מודעים לאופן אחסון הנתונים הקשורים לתשלום:
        </p>
        <ul style={{ paddingRight: '1.25rem', marginTop: '0.5rem', lineHeight: 1.7 }}>
          <li>
            <strong>פרטי כרטיס האשראי</strong> — נשמרים אך ורק במערכת YPAY, בהתאם לדרישות PCI-DSS.
            Aglamazo אינה רואה ואינה מאחסנת פרטי כרטיס.
          </li>
          <li>
            <strong>מטה-נתוני תשלום</strong> (שם עסק, פירוט פריטים, סכום, פרטי קשר של הלקוח,
            סטטוס התשלום) — נשמרים ב-Google Firebase Firestore לצורך הצגת עמוד התשלום
            ומעקב סטטוס. <strong>אחסון זה אינו zero-trust</strong>: צוות התפעול של Aglamazo
            ועובדי Google שנדרשים לכך עשויים לגשת לנתונים אלה בכפוף לנהלי Google.
          </li>
        </ul>
        <p style={{ marginTop: '0.5rem' }}>
          אם הדרישה שלך היא zero-trust מלא גם על מטה-נתוני התשלום, אין להשתמש בתכונת קישורי התשלום.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>7. שינויים בתנאים</h2>
        <p>
          אנו שומרים לעצמנו את הזכות לעדכן תנאי שימוש אלה מעת לעת.
          שינויים מהותיים יופיעו בהתראה בתוך האפליקציה.
          המשך השימוש לאחר עדכון מהווה הסכמה לתנאים החדשים.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>8. יצירת קשר</h2>
        <p>
          לשאלות בנוגע לתנאי השימוש, ניתן לפנות אלינו בדוא"ל:{' '}
          <a href="mailto:support@aglamaz.com" style={{ color: '#4338ca' }}>support@aglamaz.com</a>.
        </p>
      </section>

      <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '2rem' }}>
        עודכן לאחרונה: יוני 2026
      </p>
    </div>
  )
}
