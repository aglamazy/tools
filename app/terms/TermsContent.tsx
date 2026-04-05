'use client'

import { useState, useEffect } from 'react'

export default function TermsContent() {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/terms')
      .then(res => res.json())
      .then(data => { if (data.success && data.text) setText(data.text) })
      .catch(() => {})
  }, [])

  if (text) {
    return <div dangerouslySetInnerHTML={{ __html: text }} />
  }

  // Static fallback content visible to search engines before JS loads
  return (
    <div>
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>1. כללי</h2>
        <p>
          ברוכים הבאים ל-Aglamazo. השימוש באפליקציה כפוף לתנאי שימוש אלה.
          בשימוש באפליקציה, אתה מסכים לתנאים המפורטים בעמוד זה.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>2. אחסון מידע</h2>
        <p>
          כל המידע הפיננסי שלך נשמר באופן מקומי בדפדפן שלך בלבד.
          אנחנו לא מאחסנים מידע פיננסי בשרתים שלנו.
          האחריות על גיבוי הנתונים היא שלך.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>3. פרטיות</h2>
        <p>
          אנו מחויבים לפרטיות שלך. האפליקציה לא משתפת מידע אישי עם צדדים שלישיים.
          קבצי הבנק והנתונים הפיננסיים שלך נשארים במכשיר שלך.
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>4. שימוש</h2>
        <p>
          האפליקציה מיועדת לניהול פיננסי אישי ועסקי.
          השימוש בכלי ניתוח התזרים, התקציב ותחזית התשלומים הוא באחריותך.
        </p>
      </section>

      <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>טוען תנאי שימוש מעודכנים...</p>
    </div>
  )
}
