import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'התקן תוסף | Aglamaz',
  description: 'הורד והתקן את תוסף Aglamaz Form Assistant לכרום',
}

export default function ExtensionPage() {
  return (
    <main className="app" dir="rtl">
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#3b82f6' }}>
            התקן תוסף
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
            Aglamaz Form Assistant
          </p>
        </header>

        <section style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <a
            href="/api/extension/download"
            style={{
              display: 'inline-block',
              padding: '0.75rem 2rem',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '1.125rem',
            }}
          >
            הורד תוסף
          </a>
          <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>
            גרסה 1.0.0
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>הוראות התקנה</h2>
          <ol style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '2.25' }}>
            <li>
              <strong>הורד את הקובץ</strong> — לחץ על כפתור &quot;הורד תוסף&quot; למעלה
            </li>
            <li>
              <strong>פתח את דף התוספים</strong> — הקלד{' '}
              <code style={{
                background: '#f1f5f9',
                padding: '0.125rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.875rem',
                direction: 'ltr',
                display: 'inline-block',
              }}>
                chrome://extensions
              </code>{' '}
              בשורת הכתובת
            </li>
            <li>
              <strong>הפעל מצב מפתח</strong> — לחץ על המתג &quot;Developer mode&quot; בפינה הימנית העליונה
            </li>
            <li>
              <strong>טען את התוסף</strong> — חלץ את קובץ ה-ZIP ולחץ &quot;Load unpacked&quot;, בחר את התיקייה שחולצה
            </li>
          </ol>
        </section>

        <section style={{
          background: '#eff6ff',
          padding: '1.25rem',
          borderRadius: '0.5rem',
          border: '1px solid #bfdbfe',
        }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>לאחר ההתקנה</h3>
          <ul style={{ margin: 0, paddingRight: '1.5rem', lineHeight: '1.75' }}>
            <li>סמל התוסף יופיע בסרגל הכלים של כרום</li>
            <li>לחץ על הסמל כדי לפתוח את הפאנל הצדדי</li>
            <li>התחבר עם האימייל והסיסמה שלך</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
