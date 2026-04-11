import ContactForm from './ContactForm'

export default function ContactPage() {
  return (
    <main className="app" dir="rtl">
      <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>צור קשר</h1>
          <p style={{ fontSize: '1.125rem', color: '#64748b' }}>
            שאלה, בעיה או הצעה? נשמח לשמוע
          </p>
        </header>

        <ContactForm />

        <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
          או שלח אימייל ישירות ל-
          <a href="mailto:support@aglamaz.com" style={{ color: '#4338ca' }}>
            support@aglamaz.com
          </a>
        </p>
      </div>
    </main>
  )
}
