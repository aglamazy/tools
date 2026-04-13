import DemoFormClient from './DemoFormClient'

export default function DemoFormPage() {
  return (
    <div style={{ direction: 'rtl', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ background: '#1e40af', color: 'white', padding: '1.5rem', borderRadius: '0.5rem 0.5rem 0 0', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>טופס הרשמה לאודישן</h1>
        <p style={{ margin: '0.5rem 0 0', opacity: 0.85, fontSize: '0.9rem' }}>האקדמיה למוזיקה — אודישן קיץ 2026</p>
      </div>

      <DemoFormClient />

      <section style={{ marginTop: '2rem', color: '#475569', lineHeight: 1.8, fontSize: '0.95rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#1e293b', marginBottom: '0.5rem' }}>מה כולל טופס ההדגמה?</h2>
        <p>
          טופס ההדגמה הוא דוגמה אינטראקטיבית לטופס הרשמה מרובה שלבים, הכולל שלושה חלקים:
        </p>
        <ul style={{ paddingRight: '1.25rem', margin: '0.5rem 0' }}>
          <li><strong>פרטים אישיים</strong> — שם, טלפון, אימייל וכלי נגינה</li>
          <li><strong>רקע מוזיקלי</strong> — רמת ניסיון, שפה מועדפת, ביוגרפיה</li>
          <li><strong>מסמכים</strong> — העלאת קורות חיים, מכתב המלצה, תמונה וסרטון</li>
        </ul>
        <p>
          הטופס מדגים כיצד כלי מילוי הטפסים האוטומטי של Aglamazo יכול לחסוך זמן
          במילוי טפסים מקוונים חוזרים. במקום להקליד את אותם פרטים שוב ושוב,
          המערכת שומרת את הנתונים בדפדפן שלכם וממלאת אותם בלחיצה אחת.
        </p>
      </section>
    </div>
  )
}
