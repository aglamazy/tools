type ModeToggleProps = {
  isStandalone: boolean
  onToggle: () => void
}

export default function ModeToggle({ isStandalone, onToggle }: ModeToggleProps) {
  return (
    <section style={{ marginBottom: '2rem', padding: '1.5rem', border: '2px solid #3b82f6', borderRadius: '0.75rem', background: '#eff6ff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>מצב סנכרון</h2>
          <p style={{ margin: 0, color: '#1e40af', fontSize: '0.95rem' }}>
            {isStandalone
              ? 'עבודה עצמאית - הנתונים נשארים במכשיר זה בלבד'
              : 'סנכרון מרובה מכשירים - גיבוי ל-Google Drive עם נעילת תחנות'}
          </p>
        </div>
        <button
          onClick={onToggle}
          className="file-picker"
          style={{
            background: isStandalone ? '#10b981' : '#f97316',
            color: 'white',
            fontWeight: 600,
            padding: '0.75rem 1.5rem'
          }}
        >
          {isStandalone ? '🔄 עבור לסנכרון מרובה מכשירים' : '🔒 עבור למצב עצמאי'}
        </button>
      </div>
    </section>
  )
}
