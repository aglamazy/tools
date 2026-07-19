'use client'
// Catches uncaught client-side render errors and reports them through the
// server-side /api/observe/report proxy (so the ingest token stays server-side).
import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch('/api/observe/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: error.message ?? String(error),
        errorClass: error.name !== 'Error' ? error.name : undefined,
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      }),
    }).catch(() => undefined)
  }, [error])

  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: 'sans-serif', padding: '2rem', direction: 'rtl' }}>
        <h2>משהו השתבש</h2>
        <p>אירעה שגיאה בלתי צפויה. הצוות קיבל עדכון.</p>
        <button onClick={reset} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
          נסה שוב
        </button>
      </body>
    </html>
  )
}
