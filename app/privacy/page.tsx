import PrivacyContent from './PrivacyContent'

export default function PublicPrivacyPage() {
  return (
    <div dir="rtl" style={{ maxWidth: '700px', margin: '2rem auto', padding: '2rem', fontFamily: 'sans-serif', lineHeight: 1.8 }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>מדיניות פרטיות</h1>
      <PrivacyContent />
    </div>
  )
}
