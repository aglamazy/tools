export default function HomePage() {
  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>ברוכים הבאים לארגז הכלים הפיננסיים</h1>
          <p>בחר כלי מהתפריט הצדדי כדי להתחיל.</p>
        </header>

        <div style={{ padding: '2rem 0' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#475569' }}>כלים זמינים:</h2>
          <ul style={{ lineHeight: '2', color: '#64748b' }}>
            <li>💳 תחזית תשלומים עתידיים - ניתוח קובץ אשראי והצגת תשלומים עתידיים</li>
            <li>🔧 כלים נוספים יתווספו בקרוב...</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
