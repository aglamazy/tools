import TermsContent from './TermsContent'

export default function PublicTermsPage() {
  return (
    <div dir="rtl" style={{ maxWidth: '700px', margin: '2rem auto', padding: '2rem', fontFamily: 'sans-serif', lineHeight: 1.8 }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>תנאי שימוש</h1>
      <TermsContent />
    </div>
  )
}
