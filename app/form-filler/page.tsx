import FormFillerClient from './FormFillerClient'

export default function FormFillerPage() {
  return (
    <div>
      <section dir="rtl" style={{ maxWidth: 700, margin: '2rem auto 1rem', padding: '0 1rem' }}>
        <h1 style={{ fontSize: '1.5rem', color: '#1e293b', marginBottom: '0.5rem' }}>מילוי טפסים אוטומטי</h1>
        <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '1rem' }}>
          הזינו כתובת URL של טופס מקוון בשורת הכתובת למטה.
          המערכת תטען את הטופס ותזהה את השדות אוטומטית.
          באמצעות הסרגל הצדדי תוכלו למלא את כל השדות בלחיצה אחת.
        </p>
      </section>

      <FormFillerClient />

      <section dir="rtl" style={{ maxWidth: 700, margin: '2rem auto', padding: '0 1rem', color: '#475569', lineHeight: 1.8 }}>
        <h2 style={{ fontSize: '1.15rem', color: '#1e293b', marginBottom: '0.5rem' }}>איך זה עובד?</h2>
        <ol style={{ paddingRight: '1.25rem', margin: '0.5rem 0' }}>
          <li>הדביקו או הקלידו כתובת URL של טופס הרשמה מקוון</li>
          <li>הטופס ייטען בחלון הראשי</li>
          <li>הסרגל הצדדי יזהה את שדות הטופס</li>
          <li>לחצו &quot;מלא הכל&quot; כדי למלא את כל השדות אוטומטית</li>
        </ol>

        <h2 style={{ fontSize: '1.15rem', color: '#1e293b', marginTop: '1.5rem', marginBottom: '0.5rem' }}>למי זה מתאים?</h2>
        <p>
          הכלי מיועד לבעלי עסקים ועצמאים שממלאים טפסים מקוונים באופן קבוע —
          טפסי הרשמה, בקשות ממשלתיות, דוחות, הזמנות ועוד.
          כל הנתונים נשמרים בדפדפן שלכם בלבד, ללא שרתים חיצוניים.
        </p>

        <h2 style={{ fontSize: '1.15rem', color: '#1e293b', marginTop: '1.5rem', marginBottom: '0.5rem' }}>פרטיות ואבטחה</h2>
        <p>
          Aglamazo שומרת את כל המידע האישי שלכם מקומית בדפדפן בלבד.
          אנחנו לא שולחים, מאחסנים או משתפים את הנתונים שלכם עם אף גורם חיצוני.
          המידע זמין רק לכם ונמחק כאשר תמחקו את נתוני הדפדפן.
        </p>
      </section>
    </div>
  )
}
