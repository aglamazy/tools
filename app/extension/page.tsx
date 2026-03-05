import type { Metadata } from 'next'
import { readFileSync } from 'fs'
import { join } from 'path'

// Set this to the Chrome Web Store extension ID once published
const CHROME_STORE_ID = process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID || ''
const CHROME_STORE_URL = CHROME_STORE_ID
  ? `https://chromewebstore.google.com/detail/${CHROME_STORE_ID}`
  : ''

function getExtensionVersion(): string {
  try {
    const manifestPath = join(process.cwd(), 'extension', 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    return manifest.version
  } catch {
    return '?'
  }
}

export const metadata: Metadata = {
  title: 'התקן תוסף | Aglamaz',
  description: 'הורד והתקן את תוסף Aglamaz Form Assistant לכרום',
}

export default function ExtensionPage() {
  const version = getExtensionVersion()

  return (
    <main className="app" dir="rtl">
      <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>🧩</div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#3b82f6' }}>
            Aglamaz Form Assistant
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
            תוסף לכרום שעוזר למלא טפסים אוטומטית
          </p>
        </header>

        {CHROME_STORE_URL ? (
          <section style={{ marginBottom: '2rem' }}>
            <a
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '0.875rem 2.5rem',
                background: '#3b82f6',
                color: 'white',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '1.25rem',
              }}
            >
              הוסף לכרום
            </a>
            <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>
              ההתקנה מתבצעת ישירות מחנות התוספים של Chrome
            </p>
          </section>
        ) : (
          <section style={{ marginBottom: '2rem' }}>
            <a
              href="/api/extension/download"
              style={{
                display: 'inline-block',
                padding: '0.875rem 2.5rem',
                background: '#3b82f6',
                color: 'white',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '1.25rem',
              }}
            >
              הורד תוסף
            </a>
            <p style={{ marginTop: '0.75rem', color: '#64748b', fontSize: '0.875rem' }}>
              גרסה {version} — התקנה ידנית
            </p>
            <details style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                הוראות התקנה
              </summary>
              <ol style={{ marginTop: '0.75rem', paddingRight: '1.5rem', lineHeight: '2.25', color: '#475569' }}>
                <li>לחץ על &quot;הורד תוסף&quot; למעלה</li>
                <li>חלץ את קובץ ה-ZIP</li>
                <li>
                  פתח{' '}
                  <code style={{
                    background: '#f1f5f9',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem',
                    direction: 'ltr',
                    display: 'inline-block',
                  }}>
                    chrome://extensions
                  </code>
                </li>
                <li>הפעל &quot;Developer mode&quot; בפינה העליונה</li>
                <li>לחץ &quot;Load unpacked&quot; ובחר את התיקייה שחולצה</li>
              </ol>
            </details>
          </section>
        )}

        <section style={{
          background: '#eff6ff',
          padding: '1.25rem',
          borderRadius: '0.5rem',
          border: '1px solid #bfdbfe',
          textAlign: 'right',
        }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>אחרי ההתקנה</h3>
          <p style={{ margin: 0, color: '#475569', lineHeight: '1.75' }}>
            לחץ על סמל התוסף בסרגל הכלים של כרום → הפאנל הצדדי ייפתח → התחבר עם החשבון שלך.
          </p>
        </section>
      </div>
    </main>
  )
}
