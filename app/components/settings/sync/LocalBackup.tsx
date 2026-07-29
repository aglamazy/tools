type LocalBackupProps = {
  onExport: () => void
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void
  onMergeImport: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export default function LocalBackup({ onExport, onImport, onMergeImport }: LocalBackupProps) {
  return (
    <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem', background: '#fef3c7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>גיבוי ושחזור נתונים</h2>
          <p style={{ margin: '0.25rem 0 0', color: '#92400e', fontSize: '0.95rem' }}>
            ייצוא כל הנתונים לקובץ גיבוי, ייבוא מגיבוי קיים (מוחק הכל), או מיזוג מקובץ (משלים נתונים חסרים בלי למחוק). הנתונים נשארים רק במכשיר שלך.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={onExport} className="file-picker" style={{ background: '#10b981', color: 'white' }}>
            ייצא הכל
          </button>
          <label className="upload-another-btn" style={{ cursor: 'pointer', background: '#3b82f6', color: 'white' }}>
            ייבא הכל
            <input type="file" accept=".json" onChange={onImport} style={{ display: 'none' }} />
          </label>
          <label className="upload-another-btn" style={{ cursor: 'pointer', background: '#f59e0b', color: 'white' }}>
            מזג מקובץ
            <input type="file" accept=".json" onChange={onMergeImport} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
    </section>
  )
}
